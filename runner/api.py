"""
Flask API server for the prompt-evolution runner.
Runs on port 5001 (internal, proxied through Next.js /api/runner/*).

Endpoints
─────────
POST /evolve              — start a prompt-evolution run
GET  /status              — current runner state
GET  /stream              — SSE event stream
GET  /lineage             — list all prompt lineages
GET  /lineage/<slug>      — full lineage JSON
DELETE /lineage/<slug>    — delete a lineage file
GET  /models              — cached model list
POST /models/refresh      — re-ping all Ollama models
GET  /events/history      — last 500 buffered SSE events
"""
import json
import os
import pathlib
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime

from flask import Flask, Response, jsonify, request, stream_with_context

app = Flask(__name__)

BASE_DIR      = pathlib.Path(os.environ.get("BASE_DIR", "."))
STATE_DIR     = BASE_DIR / "runner" / "state"
STATE_FILE    = STATE_DIR / "current.json"
RUNNER_SCRIPT = BASE_DIR / "runner" / "tournament_runner.py"
DATA_DIR      = BASE_DIR / "data"

STATE_DIR.mkdir(parents=True, exist_ok=True)

# ── State management ──────────────────────────────────────────────────────
_lock   = threading.Lock()
_proc   = None      # current subprocess
_events: list[dict] = []


def _read_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"status": "idle"}


def _write_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def _reset_state(status: str = "idle", **extra) -> None:
    _write_state({"status": status, "updated_at": datetime.now().isoformat(), **extra})


# ── SSE broadcast ─────────────────────────────────────────────────────────
_subscribers: list[list] = []
_subscribers_lock = threading.Lock()


def _broadcast(event: dict) -> None:
    global _events
    _events.append(event)
    if len(_events) > 2000:
        _events = _events[-1000:]
    with _subscribers_lock:
        dead = []
        for q in _subscribers:
            try:
                q.append(event)
            except Exception:
                dead.append(q)
        for q in dead:
            _subscribers.remove(q)


def _run_process(cmd: list[str], env: dict) -> None:
    global _proc, _events
    _events = []
    _broadcast({"type": "runner_start", "cmd": cmd[2] if len(cmd) > 2 else "unknown"})

    try:
        _proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, env={**os.environ, **env},
            cwd=str(BASE_DIR),
        )

        for line in _proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                event = {"type": "log", "message": line}
            _broadcast(event)

            if event.get("type") == "evolve_done":
                _reset_state("idle", finished_at=datetime.now().isoformat())
            elif event.get("type") == "error":
                _reset_state("error", error=event.get("message"))

        _proc.wait()
        if _proc.returncode != 0:
            err = _proc.stderr.read() if _proc.stderr else ""
            _broadcast({"type": "error",
                        "message": err or f"Exit code {_proc.returncode}"})
            _reset_state("error", error=err[:500] if err else f"Exit {_proc.returncode}")
        else:
            if _read_state().get("status") not in ("idle", "error"):
                _reset_state("idle")

    except Exception as e:
        _broadcast({"type": "error", "message": str(e)})
        _reset_state("error", error=str(e))
    finally:
        _broadcast({"type": "runner_end"})
        with _lock:
            _proc = None


# ── Routes ─────────────────────────────────────────────────────────────────

@app.route("/status")
def status():
    state = _read_state()
    with _lock:
        state["running"] = _proc is not None and _proc.poll() is None
    return jsonify(state)


@app.route("/stream")
def stream():
    """SSE stream — replays buffered events first, then live events."""
    client_queue: list = []

    def generate():
        for evt in list(_events):
            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"

        with _subscribers_lock:
            _subscribers.append(client_queue)

        try:
            last_ping = time.time()
            while True:
                if client_queue:
                    evt = client_queue.pop(0)
                    yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
                    if evt.get("type") == "runner_end":
                        break
                else:
                    if time.time() - last_ping > 15:
                        yield ": ping\n\n"
                        last_ping = time.time()
                    time.sleep(0.1)
        finally:
            with _subscribers_lock:
                if client_queue in _subscribers:
                    _subscribers.remove(client_queue)

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":       "keep-alive",
        },
    )


@app.route("/evolve", methods=["POST"])
def run_evolve_endpoint():
    with _lock:
        if _proc is not None and _proc.poll() is None:
            return jsonify({"error": "Runner is busy"}), 409

    body = request.json or {}
    theme       = (body.get("theme") or "").strip()
    base_task   = (body.get("base_task") or "").strip()
    judge       = body.get("judge")
    contestants = body.get("contestants") or []

    if not theme or not base_task or not judge or not contestants:
        return jsonify({"error": "theme, base_task, judge, contestants required"}), 400

    cmd = [
        sys.executable, str(RUNNER_SCRIPT), "evolve",
        "--theme",              theme,
        "--base-task",          base_task,
        "--judge",              judge,
        "--contestants",        ",".join(contestants),
        "--generations",        str(body.get("generations", 2)),
        "--candidates-per-gen", str(body.get("candidates_per_gen", 3)),
        "--operators",          body.get(
            "operators",
            "zero_order,first_order,hyper,lamarckian,"
            "eda,eda_rank_index,lineage_based,crossover,workbook"
        ),
        "--seed",               str(body.get("seed", 42)),
    ]

    env = {
        "DATA_DIR":       str(DATA_DIR),
        "OLLAMA_HOST":    os.environ.get("OLLAMA_HOST", "https://ollama.com"),
        "OLLAMA_API_KEY": os.environ.get("OLLAMA_API_KEY", ""),
    }

    _reset_state("running_evolve", theme=theme, started_at=datetime.now().isoformat())
    threading.Thread(target=_run_process, args=(cmd, env), daemon=True).start()
    return jsonify({"ok": True, "status": "started"})


@app.route("/cancel", methods=["POST"])
def cancel():
    with _lock:
        if _proc is None or _proc.poll() is not None:
            return jsonify({"error": "Nothing running"}), 409
        try:
            _proc.send_signal(signal.SIGTERM)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    _broadcast({"type": "cancelled"})
    _reset_state("idle", cancelled_at=datetime.now().isoformat())
    return jsonify({"ok": True})


@app.route("/models")
def list_models():
    cache_file = DATA_DIR / "models.json"
    if cache_file.exists():
        with open(cache_file) as f:
            return jsonify(json.load(f))
    return jsonify({"available": [], "blocked": [], "checked_at": None})


@app.route("/models/refresh", methods=["POST"])
def refresh_models():
    with _lock:
        if _proc is not None and _proc.poll() is None:
            return jsonify({"error": "Runner is busy"}), 409

    cmd = [sys.executable, str(RUNNER_SCRIPT), "models", "--recheck"]
    env = {
        "DATA_DIR":       str(DATA_DIR),
        "OLLAMA_HOST":    os.environ.get("OLLAMA_HOST", "https://ollama.com"),
        "OLLAMA_API_KEY": os.environ.get("OLLAMA_API_KEY", ""),
    }
    _reset_state("checking_models")
    threading.Thread(target=_run_process, args=(cmd, env), daemon=True).start()
    return jsonify({"ok": True})


@app.route("/lineage")
def list_lineages_route():
    d = DATA_DIR / "prompt_lineage"
    if not d.exists():
        return jsonify([])
    results = []
    for f in sorted(d.glob("*.json")):
        try:
            with open(f, encoding="utf-8") as fp:
                lin = json.load(fp)
            scored = [p for p in lin.get("prompts", [])
                      if p.get("fitness", {}).get("n_evals")]
            best = max((p["fitness"]["avg_score"] for p in scored), default=None)
            results.append({
                "theme_slug":  lin["theme_slug"],
                "theme_label": lin.get("theme_label", lin["theme_slug"]),
                "updated_at":  lin.get("updated_at"),
                "prompts":     len(lin.get("prompts", [])),
                "generations": len(lin.get("generations", [])),
                "best_score":  round(best, 2) if best is not None else None,
            })
        except Exception:
            continue
    return jsonify(results)


@app.route("/lineage/<theme_slug>")
def get_lineage(theme_slug: str):
    f = DATA_DIR / "prompt_lineage" / f"{theme_slug}.json"
    if not f.exists():
        return jsonify({"error": "not found"}), 404
    try:
        with open(f, encoding="utf-8") as fp:
            return jsonify(json.load(fp))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/lineage/<theme_slug>", methods=["DELETE"])
def delete_lineage(theme_slug: str):
    f = DATA_DIR / "prompt_lineage" / f"{theme_slug}.json"
    if not f.exists():
        return jsonify({"error": "not found"}), 404
    try:
        f.unlink()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/events/history")
def events_history():
    return jsonify(_events[-500:])


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=5001)
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args()
    app.run(host=args.host, port=args.port, threaded=True)
