"""
Runner entry-point.

Subcommands:
  evolve   — prompt evolution loop (Blind Double-Shuffle + PromptBreeder ops)
  models   — list / recheck available Ollama models

Everything else (Swiss tournament, article generation, editorial roles) has been
removed.  The old tournament_runner.py is preserved in git history.
"""
import argparse
import json
import os
import pathlib
import sys
import time
from datetime import datetime
from typing import Optional

import requests

# ── Config ────────────────────────────────────────────────────────────────
HOST_URL  = os.environ.get("OLLAMA_HOST",   "https://ollama.com")
API_KEY   = os.environ.get("OLLAMA_API_KEY", "")
DATA_DIR  = pathlib.Path(os.environ.get("DATA_DIR", "./data"))

REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "180"))
JUDGE_TIMEOUT   = int(os.environ.get("JUDGE_TIMEOUT",   "240"))

MODELS_CACHE = DATA_DIR / "models.json"


# ── Event emitter ─────────────────────────────────────────────────────────
def emit(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)

def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ── HTTP helpers ──────────────────────────────────────────────────────────
def _headers() -> dict:
    return {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}


def ask(
    model: str,
    prompt: str,
    system: str = "",
    timeout: int = REQUEST_TIMEOUT,
) -> tuple[Optional[str], Optional[float]]:
    payload: dict = {"model": model, "prompt": prompt, "stream": False}
    if system:
        payload["system"] = system
    try:
        t0 = time.time()
        r = requests.post(
            f"{HOST_URL}/api/generate",
            json=payload, headers=_headers(), timeout=timeout,
        )
        r.raise_for_status()
        elapsed = round(time.time() - t0, 2)
        reply = r.json().get("response", "").strip()
        return (reply or None), elapsed
    except requests.exceptions.Timeout:
        return None, None
    except requests.exceptions.HTTPError as e:
        code = e.response.status_code if e.response is not None else "?"
        log(f"  HTTP {code} for {model}")
        return None, None
    except Exception as e:
        log(f"  {type(e).__name__} for {model}: {e}")
        return None, None


def ping_model(name: str) -> bool:
    try:
        r = requests.post(
            f"{HOST_URL}/api/generate",
            json={"model": name, "prompt": "1", "num_predict": 1, "stream": False},
            headers=_headers(), timeout=30,
        )
        return r.status_code == 200 and r.json().get("response") is not None
    except Exception:
        return False


def get_all_models() -> list[dict]:
    try:
        r = requests.get(f"{HOST_URL}/api/tags", headers=_headers(), timeout=10)
        r.raise_for_status()
        return [
            {"name": m["name"], "size_gb": round(m.get("size", 0) / 1e9, 2)}
            for m in r.json().get("models", [])
        ]
    except Exception as e:
        log(f"Failed to get models: {e}")
        return []


def get_available_models(force_recheck: bool = False) -> list[dict]:
    MODELS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    if not force_recheck and MODELS_CACHE.exists():
        with open(MODELS_CACHE) as f:
            return json.load(f).get("available", [])

    emit({"type": "status", "message": "Checking available models..."})
    all_models = get_all_models()
    ok, blocked = [], []
    for i, m in enumerate(all_models):
        emit({"type": "model_check", "model": m["name"],
              "index": i + 1, "total": len(all_models)})
        if ping_model(m["name"]):
            ok.append(m)
        else:
            blocked.append(m["name"])

    cache = {
        "checked_at": datetime.now().isoformat(),
        "host": HOST_URL,
        "available": ok,
        "blocked": blocked,
    }
    with open(MODELS_CACHE, "w") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

    emit({"type": "models_ready", "available": len(ok), "blocked": len(blocked)})
    return ok


# ── CLI ────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="LLM Arena runner")
    sub = parser.add_subparsers(dest="cmd")

    # evolve subcommand
    e = sub.add_parser("evolve", help="Run prompt evolution loop")
    e.add_argument("--theme",              required=True,
                   help="Theme label (slug derived automatically)")
    e.add_argument("--seeds-json",         required=True,
                   help="JSON array of seed prompt texts (generation 0)")
    e.add_argument("--judge",              required=True,
                   help="Model used as judge and mutator")
    e.add_argument("--contestants",        required=True,
                   help="Comma-separated contestant model names")
    e.add_argument("--generations",        type=int, default=2)
    e.add_argument("--candidates-per-gen", type=int, default=3)
    e.add_argument("--operators",
                   default="zero_order,first_order,hyper,lamarckian,"
                           "eda,eda_rank_index,lineage_based,crossover,workbook")
    e.add_argument("--seed",               type=int, default=42)

    # models subcommand
    m = sub.add_parser("models", help="List / recheck available models")
    m.add_argument("--recheck", action="store_true")

    args = parser.parse_args()

    if args.cmd == "evolve":
        import json as _json
        from evolve import run_evolve
        run_evolve(
            theme=args.theme,
            seeds=_json.loads(args.seeds_json),
            contestants=[c.strip() for c in args.contestants.split(",") if c.strip()],
            judge=args.judge,
            generations=args.generations,
            candidates_per_gen=args.candidates_per_gen,
            operators=[o.strip() for o in args.operators.split(",") if o.strip()],
            seed=args.seed,
            data_dir=DATA_DIR,
            ask=ask,
            judge_timeout=JUDGE_TIMEOUT,
        )

    elif args.cmd == "models":
        available = get_available_models(force_recheck=args.recheck)
        emit({"type": "models_list", "models": available})

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
