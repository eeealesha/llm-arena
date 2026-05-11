"""
Prompt-evolution main loop — Blind Double-Shuffle edition.

Architecture (PromptBreeder + GEPA hybrid, Fernando et al. 2023):
  1. Load (or seed) lineage for the theme.
  2. For each generation:
       a) Pick N parents from the Pareto frontier (stochastic).
       b) Apply a PromptBreeder mutation operator → child prompt.
       c) Evaluate: every contestant generates a response, then a round-robin
          Blind Double-Shuffle tournament between all responses determines
          per-criterion scores and win-rates.
       d) Update child fitness; recompute Pareto frontier.
  3. Persist lineage after every successful evaluation.

Evaluation details
──────────────────
Blind Double-Shuffle (anti-position-bias, Zheng et al. 2023 §4):
  For every pair (response_A, response_B):
    Round 1  →  judge sees [A, B]  →  verdict_1
    Round 2  →  judge sees [B, A]  →  verdict_2 (normalised back to A/B labels)
    If verdict_1 == verdict_2 (and not TIE)  →  that response wins.
    Otherwise  →  TIE.

Strict Utility Scoring (4 criteria, 1–10):
  • instruction_following  — precision of adherence to every requirement
  • logic_accuracy         — factual correctness; real citations raise score;
                             hallucinations reduce it  (IFEval, Zhou et al. 2023)
  • density                — information per word; penalises AI-filler, hedging,
                             padding  (Liu et al. 2023 "Lost in the Middle")
  • specificity            — concrete details, named examples, numbers vs vague claims
"""
from __future__ import annotations
import json
import pathlib
import random
import re
import time
from datetime import datetime
from typing import Optional

from lineage import (
    CRITERIA,
    add_prompt,
    load_lineage,
    mark_pareto,
    record_generation,
    save_lineage,
    select_parents_for_mutation,
    slugify,
    update_fitness,
)
from mutations import ALL_OPERATORS, apply_operator


# ── System prompts ────────────────────────────────────────────────────────

SYSTEM_AUTHOR = (
    "You are a professional writer. Be concrete, specific, and avoid filler. "
    "Return ONLY the finished response — no preamble, no meta-commentary."
)

# Utility scoring rubric — judge sees TWO responses and scores both.
# Hard-anchored scale forces realistic score distribution (not grade inflation).
JUDGE_RUBRIC_UTILITY = (
    "You are a STRICT evaluator. Your job is to find weaknesses, not to be polite.\n\n"
    "SCORING SCALE — read carefully before scoring:\n"
    "  1–2  Unacceptable: ignores the prompt, factual errors, pure filler\n"
    "  3–4  Below average: mostly misses the mark, weak structure, vague\n"
    "  5    Average: completes the task acceptably, nothing remarkable\n"
    "  6–7  Good: clearly above average, concrete, mostly accurate\n"
    "  8–9  Excellent: a professional would be proud, well-sourced, dense\n"
    "  10   Exceptional: cites real verifiable sources, zero filler, could be published\n\n"
    "IMPORTANT: Most responses score 4–7. Giving 8+ requires a specific reason.\n"
    "Do NOT cluster scores at 8–10 — this defeats the purpose of evaluation.\n\n"
    "Score EACH response (A and B) on four criteria:\n\n"
    "• instruction_following — every explicit and implicit requirement addressed?\n"
    "  Penalise: ignored constraints, off-topic tangents, missing structure.\n\n"
    "• logic_accuracy — factual correctness, sound reasoning.\n"
    "  Real verifiable references → higher. Hallucinations, made-up stats → lower.\n\n"
    "• density — information per word. Penalise: 'Certainly!', 'It is important to note',\n"
    "  'In conclusion', excessive hedging, repetition, padding.\n\n"
    "• specificity — concrete named tools, real numbers, actionable details.\n"
    "  Penalise: vague generalities, 'some experts say', unverifiable claims.\n\n"
    "Respond in strict JSON — no markdown:\n"
    '{"scores_a": {"instruction_following": X, "logic_accuracy": X, "density": X, "specificity": X}, '
    '"scores_b": {"instruction_following": X, "logic_accuracy": X, "density": X, "specificity": X}, '
    '"preferred": "A" | "B" | "TIE", '
    '"reasoning": "2–3 sentences citing SPECIFIC weaknesses, not just positives"}'
)


def _emit(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


# ── Judge helpers ─────────────────────────────────────────────────────────

def _clamp(v, lo=1, hi=10) -> int:
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return 5


def _judge_once(
    judge: str,
    post_a: str,
    post_b: str,
    ask,
    judge_timeout: int,
) -> tuple[str, dict, dict, str]:
    """Single judge pass. Returns (verdict, scores_a, scores_b, reasoning)."""
    prompt = f"=== RESPONSE A ===\n{post_a}\n\n=== RESPONSE B ===\n{post_b}\n\nEvaluate both."
    reply, _ = ask(judge, prompt, JUDGE_RUBRIC_UTILITY, judge_timeout)
    if not reply:
        neutral = {c: 5 for c in CRITERIA}
        return "TIE", neutral, neutral, "no reply"
    try:
        cleaned = re.sub(r"```(?:json)?|```", "", reply).strip()
        data = json.loads(cleaned)
        sa = {c: _clamp(data["scores_a"].get(c, 5)) for c in CRITERIA}
        sb = {c: _clamp(data["scores_b"].get(c, 5)) for c in CRITERIA}
        pref = str(data.get("preferred", "TIE")).upper().strip()
        pref = pref if pref in ("A", "B", "TIE") else "TIE"
        reasoning = str(data.get("reasoning", "")).strip()[:400]
        return pref, sa, sb, reasoning
    except Exception:
        neutral = {c: 5 for c in CRITERIA}
        return "TIE", neutral, neutral, (reply or "")[:150]


def _judge_double_shuffle(
    judge: str,
    post_a: str,
    post_b: str,
    ask,
    judge_timeout: int,
) -> tuple[str, dict, dict, str]:
    """
    Blind Double-Shuffle comparison.

    Round 1: judge sees [A, B]  → v1, sa1, sb1
    Round 2: judge sees [B, A]  → v2_raw, sb2, sa2  (positions swapped)
    Normalise v2: 'A' in round-2 position == original B, so flip labels.
    Final verdict: consistent non-TIE → that verdict; else TIE.
    Scores: average of both rounds (reduce noise).
    """
    v1, sa1, sb1, r1 = _judge_once(judge, post_a, post_b, ask, judge_timeout)
    v2_raw, sb2, sa2, r2 = _judge_once(judge, post_b, post_a, ask, judge_timeout)

    # Normalise v2 back to A/B labels of original order
    v2 = {"A": "B", "B": "A", "TIE": "TIE"}.get(v2_raw, "TIE")

    # Average scores across both rounds
    scores_a = {c: round((sa1.get(c, 5) + sa2.get(c, 5)) / 2, 1) for c in CRITERIA}
    scores_b = {c: round((sb1.get(c, 5) + sb2.get(c, 5)) / 2, 1) for c in CRITERIA}

    # Consistency check
    verdict = v1 if (v1 == v2 and v1 != "TIE") else "TIE"
    reasoning = f"[pass-1:{v1}] {r1} | [pass-2(swapped)→{v2}] {r2}"
    return verdict, scores_a, scores_b, reasoning


# ── Core evaluation ───────────────────────────────────────────────────────

def _evaluate_prompt(
    *,
    prompt_text: str,
    theme_label: str,
    contestants: list[str],
    judge: str,
    ask,
    judge_timeout: int,
) -> list[dict]:
    """
    Evaluate a prompt via a round-robin Blind Double-Shuffle tournament.

    1. Every contestant model generates a response to the prompt.
    2. All pairs of responses are compared using double-shuffle (O(n²) judge calls × 2).
    3. Each model gets per-criterion averaged scores + win-rate from all comparisons.

    Returns a list of {model, criterion_scores, win_rate, feedback, post} dicts,
    compatible with lineage.update_fitness().
    """
    # Step 1 — generate responses
    responses: dict[str, str] = {}
    for model in contestants:
        _emit({"type": "minibatch_post_start", "model": model})
        post, t = ask(model, f"Topic: {theme_label}\n\n{prompt_text}", SYSTEM_AUTHOR, 120)
        if post:
            responses[model] = post
            _emit({"type": "minibatch_post_done",
                   "model": model, "words": len(post.split()), "time": t})
        else:
            _emit({"type": "minibatch_post_failed", "model": model})

    models = list(responses.keys())

    # Edge case: single response → can't do pairwise; score alone
    if len(models) == 1:
        m = models[0]
        _emit({"type": "minibatch_single_response", "model": m})
        # Use judge to score A vs a deliberately weak baseline so we still
        # get meaningful criterion scores (baseline is a one-word stub)
        stub = "(no response)"
        _, sa, _, reasoning = _judge_double_shuffle(
            judge, responses[m], stub, ask, judge_timeout
        )
        _emit({"type": "minibatch_judged", "model_a": m, "model_b": "baseline",
               "verdict": "A", "scores_a": sa})
        return [{
            "model": m,
            "criterion_scores": sa,
            "win_rate": 1.0,
            "feedback": reasoning,
            "post": responses[m],
        }]

    if not models:
        return []

    # Step 2 — round-robin double-shuffle tournament
    wins  = {m: 0   for m in models}
    total = {m: 0   for m in models}
    score_acc = {m: {c: [] for c in CRITERIA} for m in models}

    for i in range(len(models)):
        for j in range(i + 1, len(models)):
            ma, mb = models[i], models[j]
            verdict, sa, sb, reasoning = _judge_double_shuffle(
                judge, responses[ma], responses[mb], ask, judge_timeout
            )
            _emit({
                "type": "minibatch_judged",
                "model_a": ma, "model_b": mb,
                "verdict": verdict,
                "scores_a": sa, "scores_b": sb,
                "reasoning": reasoning[:200],
            })
            for c in CRITERIA:
                score_acc[ma][c].append(sa[c])
                score_acc[mb][c].append(sb[c])
            total[ma] += 1
            total[mb] += 1
            if verdict == "A":
                wins[ma] += 1
            elif verdict == "B":
                wins[mb] += 1

    # Step 3 — aggregate
    scored: list[dict] = []
    for m in models:
        n = total[m]
        if n == 0:
            continue
        avg = {c: round(sum(score_acc[m][c]) / len(score_acc[m][c]), 2)
               for c in CRITERIA}
        wr = round(wins[m] / n, 2)
        scored.append({
            "model": m,
            "criterion_scores": avg,
            "win_rate": wr,
            "feedback": f"win_rate={wr:.0%} over {n} match(es)",
            "post": responses[m],
        })

    return scored


def _aggregate_feedback(scored: list[dict]) -> str:
    """Human-readable summary used as lineage feedback_summary."""
    if not scored:
        return ""
    # Sort by avg score descending
    ranked = sorted(scored, key=lambda s: sum(s["criterion_scores"].values()), reverse=True)
    parts = []
    for s in ranked:
        short = s["model"].split(":")[0].split("/")[-1]
        cs = s["criterion_scores"]
        avg = round(sum(cs.values()) / len(cs), 1)
        wr  = s.get("win_rate", 0)
        wins_str = f"won {int(wr * 100)}% of comparisons"
        # highlight top criteria
        top_c = max(cs, key=lambda c: cs[c])
        parts.append(f"{short}: avg {avg}/10, {wins_str}, best on {top_c}")
    return "; ".join(parts)[:800]


# ── Main evolution loop ────────────────────────────────────────────────────

def run_evolve(
    *,
    theme: str,
    seeds: list[str],          # one or more initial prompts (gen 0)
    contestants: list[str],
    judge: str,
    generations: int,
    candidates_per_gen: int,
    operators: list[str],
    seed: int,
    data_dir: pathlib.Path,
    ask,
    judge_timeout: int = 180,
):
    rng = random.Random(seed)
    theme_slug = slugify(theme)

    lineage = load_lineage(data_dir, theme_slug)
    if not lineage.get("theme_label"):
        lineage["theme_label"] = theme

    # ── Seed generation 0 if lineage is empty ─────────────────────────────
    if not lineage["prompts"]:
        seed_ids: list[str] = []
        _emit({
            "type": "evolve_start",
            "theme": theme, "theme_slug": theme_slug,
            "generations": generations,
            "candidates_per_gen": candidates_per_gen,
            "contestants": contestants,
            "judge": judge,
            "operators": operators,
            "evaluation": "blind_double_shuffle",
            "criteria": CRITERIA,
            "n_seeds": len(seeds),
        })

        for seed_text in seeds:
            seed_prompt = add_prompt(
                lineage,
                text=seed_text.strip(),
                parent_id=None,
                mutation_op="seed",
                generation=0,
            )
            _emit({"type": "prompt_evaluating",
                   "id": seed_prompt["id"], "generation": 0, "op": "seed"})

            scored = _evaluate_prompt(
                prompt_text=seed_prompt["text"],
                theme_label=theme,
                contestants=contestants,
                judge=judge,
                ask=ask,
                judge_timeout=judge_timeout,
            )
            if scored:
                update_fitness(seed_prompt, scored)
                seed_prompt["fitness"]["win_rate"] = round(
                    max(s.get("win_rate", 0) for s in scored), 2
                )
                seed_prompt["feedback_summary"] = _aggregate_feedback(scored)

            seed_ids.append(seed_prompt["id"])
            _emit({
                "type": "prompt_evaluated",
                "id": seed_prompt["id"],
                "fitness": seed_prompt["fitness"],
                "is_pareto": seed_prompt.get("is_pareto", False),
                "text": seed_prompt["text"],
            })

        mark_pareto(lineage)
        record_generation(lineage, 0, seed_ids)
        save_lineage(data_dir, lineage)

        start_gen = 1
    else:
        # Resume: continue from the next generation after the highest recorded
        start_gen = max((g["gen"] for g in lineage["generations"]), default=0) + 1
        _emit({
            "type": "evolve_start",
            "theme": theme, "theme_slug": theme_slug,
            "generations": generations,
            "candidates_per_gen": candidates_per_gen,
            "contestants": contestants,
            "judge": judge,
            "operators": operators,
            "evaluation": "blind_double_shuffle",
            "criteria": CRITERIA,
            "resumed_from_gen": start_gen,
        })

    # ── Main loop ──────────────────────────────────────────────────────────
    def _ask_text(user: str, system: str) -> Optional[str]:
        """Adapter for mutation operators (signature without model/timeout)."""
        r, _t = ask(judge, user, system, 120)
        return r

    for g in range(start_gen, start_gen + generations):
        _emit({"type": "generation_start", "gen": g, "candidates": candidates_per_gen})

        parents = select_parents_for_mutation(lineage, candidates_per_gen, rng)
        added_ids: list[str] = []

        for parent in parents:
            op = rng.choice(operators)
            _emit({"type": "mutation_attempt",
                   "gen": g, "op": op, "parent_id": parent["id"]})

            new_text = apply_operator(
                op, parent, theme, _ask_text, rng, lineage=lineage
            )

            if not new_text:
                _emit({"type": "mutation_failed", "gen": g, "op": op,
                       "parent_id": parent["id"], "reason": "empty_or_off_theme"})
                continue
            if len(new_text) < 20:
                _emit({"type": "mutation_failed", "gen": g, "op": op,
                       "parent_id": parent["id"], "reason": "too_short"})
                continue
            if new_text == parent["text"]:
                _emit({"type": "mutation_failed", "gen": g, "op": op,
                       "parent_id": parent["id"], "reason": "identical_to_parent"})
                continue

            child = add_prompt(
                lineage,
                text=new_text,
                parent_id=parent["id"],
                mutation_op=op,
                generation=g,
            )
            _emit({"type": "mutation_done",
                   "gen": g, "op": op,
                   "parent_id": parent["id"],
                   "id": child["id"],
                   "text": child["text"]})

            _emit({"type": "prompt_evaluating",
                   "id": child["id"], "generation": g, "op": op})

            scored = _evaluate_prompt(
                prompt_text=child["text"],
                theme_label=theme,
                contestants=contestants,
                judge=judge,
                ask=ask,
                judge_timeout=judge_timeout,
            )
            if scored:
                update_fitness(child, scored)
                child["fitness"]["win_rate"] = round(
                    max(s.get("win_rate", 0) for s in scored), 2
                )
                child["feedback_summary"] = _aggregate_feedback(scored)

            mark_pareto(lineage)
            save_lineage(data_dir, lineage)
            added_ids.append(child["id"])

            _emit({
                "type": "prompt_evaluated",
                "id": child["id"],
                "fitness": child["fitness"],
                "is_pareto": child["is_pareto"],
            })

        record_generation(lineage, g, added_ids)
        save_lineage(data_dir, lineage)

        pareto = [p["id"] for p in lineage["prompts"] if p.get("is_pareto")]
        _emit({"type": "generation_done",
               "gen": g, "added_ids": added_ids, "pareto_ids": pareto})

    _emit({
        "type": "evolve_done",
        "theme_slug": theme_slug,
        "total_prompts": len(lineage["prompts"]),
        "generations_completed": start_gen + generations - 1,
    })
