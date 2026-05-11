"""
Prompt-evolution lineage store.

A single lineage describes one theme (e.g. "Объясни RAG джуну") and contains
an evolving population of prompt candidates with parent/child relationships,
mutation operators, and per-criterion fitness.

JSON shape: see _empty_lineage().
"""
from __future__ import annotations
import json
import pathlib
import re
import time
import uuid
from datetime import datetime
from typing import Optional


CRITERIA = ["engagement", "informativeness", "accuracy", "originality"]
LINEAGE_DIR_NAME = "prompt_lineage"


# ── Slug ──────────────────────────────────────────────────────────────────
_TRANSLIT = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"yo","ж":"zh","з":"z",
    "и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
    "с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch",
    "ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya",
}

def slugify(s: str) -> str:
    out = "".join(_TRANSLIT.get(c, c) for c in s.lower())
    out = re.sub(r"[^a-z0-9_\-]+", "-", out)
    return re.sub(r"-+", "-", out).strip("-")


# ── Identity helpers ──────────────────────────────────────────────────────
def new_prompt_id() -> str:
    return "p" + uuid.uuid4().hex[:8]


def _empty_lineage(theme_slug: str, theme_label: str) -> dict:
    return {
        "theme_slug": theme_slug,
        "theme_label": theme_label,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "prompts": [],
        "generations": [],
    }


# ── I/O ───────────────────────────────────────────────────────────────────
def lineage_path(base_data_dir: pathlib.Path, theme_slug: str) -> pathlib.Path:
    d = base_data_dir / LINEAGE_DIR_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{theme_slug}.json"


def load_lineage(base_data_dir: pathlib.Path, theme_slug: str) -> dict:
    path = lineage_path(base_data_dir, theme_slug)
    if not path.exists():
        return _empty_lineage(theme_slug, theme_slug.replace("-", " ").capitalize())
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_lineage(base_data_dir: pathlib.Path, lineage: dict) -> None:
    lineage["updated_at"] = datetime.now().isoformat()
    path = lineage_path(base_data_dir, lineage["theme_slug"])
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(lineage, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def list_lineages(base_data_dir: pathlib.Path) -> list[dict]:
    d = base_data_dir / LINEAGE_DIR_NAME
    if not d.exists():
        return []
    out = []
    for p in sorted(d.glob("*.json")):
        try:
            with open(p, encoding="utf-8") as f:
                lin = json.load(f)
            out.append({
                "theme_slug":  lin["theme_slug"],
                "theme_label": lin.get("theme_label", lin["theme_slug"]),
                "updated_at":  lin.get("updated_at"),
                "prompts":     len(lin.get("prompts", [])),
                "generations": len(lin.get("generations", [])),
                "best_score":  _best_avg(lin),
            })
        except Exception:
            continue
    return out


def _best_avg(lin: dict) -> Optional[float]:
    scored = [p for p in lin.get("prompts", []) if p.get("fitness", {}).get("n_evals")]
    if not scored:
        return None
    return round(max(p["fitness"]["avg_score"] for p in scored), 2)


# ── Pareto frontier ───────────────────────────────────────────────────────
def _dominates(a: dict, b: dict) -> bool:
    """A strictly dominates B if A >= B on all criteria and > on at least one."""
    fa, fb = a.get("fitness", {}), b.get("fitness", {})
    if not fa.get("n_evals") or not fb.get("n_evals"):
        return False
    ge = all(fa.get(c, 0) >= fb.get(c, 0) for c in CRITERIA)
    gt = any(fa.get(c, 0) >  fb.get(c, 0) for c in CRITERIA)
    return ge and gt


def pareto_frontier(prompts: list[dict]) -> list[dict]:
    """Return non-dominated prompts (only those with evaluated fitness)."""
    scored = [p for p in prompts if p.get("fitness", {}).get("n_evals")]
    if not scored:
        return []
    return [p for p in scored if not any(_dominates(q, p) for q in scored if q["id"] != p["id"])]


def mark_pareto(lineage: dict) -> None:
    """Recompute is_pareto flag on every prompt."""
    pareto_ids = {p["id"] for p in pareto_frontier(lineage["prompts"])}
    for p in lineage["prompts"]:
        p["is_pareto"] = p["id"] in pareto_ids


# ── Fitness update ────────────────────────────────────────────────────────
def update_fitness(prompt: dict, scores: list[dict]) -> None:
    """
    scores: list of {model, criterion_scores: {engagement:..., ...}, post:...}
    Maintains a running average.
    """
    if not scores:
        return
    fit = prompt.setdefault("fitness", {c: 0.0 for c in CRITERIA})
    fit.setdefault("n_evals", 0)
    n_old = fit["n_evals"]
    n_new = len(scores)
    for c in CRITERIA:
        old = fit.get(c, 0.0) * n_old
        new = sum(s["criterion_scores"].get(c, 0) for s in scores)
        fit[c] = round((old + new) / (n_old + n_new), 2)
    fit["n_evals"] = n_old + n_new
    fit["avg_score"] = round(sum(fit[c] for c in CRITERIA) / len(CRITERIA), 2)
    prompt.setdefault("sample_outputs", {})
    for s in scores:
        prompt["sample_outputs"][s["model"]] = s.get("post", "")[:2000]


# ── Add prompt to lineage ─────────────────────────────────────────────────
def add_prompt(
    lineage: dict,
    text: str,
    parent_id: Optional[str],
    mutation_op: str,
    generation: int,
    extra: Optional[dict] = None,
) -> dict:
    new_p = {
        "id": new_prompt_id(),
        "text": text.strip(),
        "parent_id": parent_id,
        "mutation_op": mutation_op,
        "generation": generation,
        "fitness": {c: 0.0 for c in CRITERIA} | {"n_evals": 0, "avg_score": 0.0},
        "is_pareto": False,
        "sample_outputs": {},
        "created_at": datetime.now().isoformat(),
    }
    if extra:
        new_p.update(extra)
    lineage["prompts"].append(new_p)
    return new_p


def record_generation(lineage: dict, gen: int, added_ids: list[str]) -> None:
    lineage["generations"].append({
        "gen": gen,
        "added": added_ids,
        "ts": datetime.now().isoformat(),
    })


# ── Selection ─────────────────────────────────────────────────────────────
def select_parents_for_mutation(lineage: dict, n: int, rng) -> list[dict]:
    """Pick N parents stochastically from the Pareto frontier (or any scored prompt if frontier empty)."""
    pool = pareto_frontier(lineage["prompts"])
    if not pool:
        pool = [p for p in lineage["prompts"] if p.get("fitness", {}).get("n_evals")]
    if not pool:
        pool = lineage["prompts"]
    if not pool:
        return []
    return [rng.choice(pool) for _ in range(n)]
