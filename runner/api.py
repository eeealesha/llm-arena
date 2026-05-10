"""
Flask API server for the tournament runner.
Runs on port 5001 (internal, proxied through Next.js).
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

BASE_DIR     = pathlib.Path(os.environ.get("BASE_DIR", "."))
STATE_DIR    = BASE_DIR / "runner" / "state"
STATE_FILE   = STATE_DIR / "current.json"
RUNNER_SCRIPT = BASE_DIR / "runner" / "tournament_runner.py"
DATA_DIR     = BASE_DIR / "data"
ARTICLES_DIR = BASE_DIR / "public" / "data" / "articles"

STATE_DIR.mkdir(parents=True, exist_ok=True)

# ── State management ──────────────────────────────────────
_lock   = threading.Lock()
_proc   = None   # current subprocess
_events = []     # buffered events for late-joining clients

def _read_state() -> dict:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"status": "idle"}

def _write_state(state: dict):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

def _reset_state(status: str = "idle", **extra):
    _write_state({"status": status, "updated_at": datetime.now().isoformat(), **extra})

# ── SSE event broadcast ───────────────────────────────────
_subscribers = []
_subscribers_lock = threading.Lock()

def _broadcast(event: dict):
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

def _run_process(cmd: list, env: dict):
    global _proc, _events
    _events = []
    _broadcast({"type": "runner_start", "cmd": cmd[2] if len(cmd) > 2 else "unknown"})

    try:
        _proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
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

            if event.get("type") == "done":
                _reset_state("idle", last_tournament_id=event.get("tournament_id"),
                             finished_at=datetime.now().isoformat())
            elif event.get("type") == "article_done":
                _reset_state("idle", last_article_id=event.get("id"),
                             finished_at=datetime.now().isoformat())
            elif event.get("type") == "error":
                _reset_state("error", error=event.get("message"))

        _proc.wait()
        if _proc.returncode != 0:
            err = _proc.stderr.read() if _proc.stderr else ""
            _broadcast({"type": "error", "message": err or f"Exit code {_proc.returncode}"})
            _reset_state("error", error=err[:500] if err else f"Exit {_proc.returncode}")
        else:
            state = _read_state()
            if state.get("status") not in ("idle", "error"):
                _reset_state("idle")

    except Exception as e:
        _broadcast({"type": "error", "message": str(e)})
        _reset_state("error", error=str(e))
    finally:
        _broadcast({"type": "runner_end"})
        with _lock:
            _proc = None

# ── Routes ────────────────────────────────────────────────

@app.route("/status")
def status():
    state = _read_state()
    with _lock:
        state["running"] = _proc is not None and _proc.poll() is None
    return jsonify(state)

@app.route("/stream")
def stream():
    """SSE stream — sends buffered events to new clients, then live events."""
    client_queue = []

    def generate():
        # Send all buffered events first
        for evt in list(_events):
            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"

        # Register for live events
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
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )

@app.route("/run", methods=["POST"])
def run_tournament():
    with _lock:
        if _proc is not None and _proc.poll() is None:
            return jsonify({"error": "A tournament is already running"}), 409

    body = request.json or {}
    task = body.get("task", "").strip()
    if not task:
        return jsonify({"error": "task is required"}), 400

    judge         = body.get("judge")
    max_cont      = body.get("max_contestants")
    swiss_rounds  = body.get("swiss_rounds")
    commentator   = body.get("commentator")
    iteration     = body.get("iteration", 1)
    models_json   = body.get("models_json")

    cmd = [sys.executable, str(RUNNER_SCRIPT), "tournament", "--task", task]
    if judge:          cmd += ["--judge", judge]
    if max_cont:       cmd += ["--max-contestants", str(max_cont)]
    if swiss_rounds:   cmd += ["--swiss-rounds", str(swiss_rounds)]
    if commentator:    cmd += ["--commentator", commentator]
    if iteration:      cmd += ["--iteration", str(iteration)]
    if models_json:    cmd += ["--models-json", models_json]

    env = {
        "DATA_DIR":      str(DATA_DIR),
        "ARTICLES_DIR":  str(ARTICLES_DIR),
        "OLLAMA_HOST":   os.environ.get("OLLAMA_HOST", "https://ollama.com"),
        "OLLAMA_API_KEY": os.environ.get("OLLAMA_API_KEY", ""),
    }

    _reset_state("running", task=task, judge=judge or "auto",
                 started_at=datetime.now().isoformat())
    thread = threading.Thread(target=_run_process, args=(cmd, env), daemon=True)
    thread.start()

    return jsonify({"ok": True, "status": "started"})

@app.route("/cancel", methods=["POST"])
def cancel():
    with _lock:
        if _proc is None or _proc.poll() is not None:
            return jsonify({"error": "No tournament running"}), 409
        try:
            _proc.send_signal(signal.SIGTERM)
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    _broadcast({"type": "cancelled"})
    _reset_state("idle", cancelled_at=datetime.now().isoformat())
    return jsonify({"ok": True})

@app.route("/article", methods=["POST"])
def run_article():
    with _lock:
        if _proc is not None and _proc.poll() is None:
            return jsonify({"error": "Runner is busy"}), 409

    body = request.json or {}
    topic = body.get("topic", "").strip()
    if not topic:
        return jsonify({"error": "topic is required"}), 400

    style      = body.get("style", "storyteller")
    iterations = body.get("iterations", 2)
    t_file     = body.get("tournament_file")

    cmd = [sys.executable, str(RUNNER_SCRIPT), "article",
           "--topic", topic, "--style", style, "--iterations", str(iterations)]
    if t_file:
        cmd += ["--tournament-file", t_file]

    env = {
        "DATA_DIR":      str(DATA_DIR),
        "ARTICLES_DIR":  str(ARTICLES_DIR),
        "OLLAMA_HOST":   os.environ.get("OLLAMA_HOST", "https://ollama.com"),
        "OLLAMA_API_KEY": os.environ.get("OLLAMA_API_KEY", ""),
    }

    _reset_state("running_article", topic=topic, started_at=datetime.now().isoformat())
    thread = threading.Thread(target=_run_process, args=(cmd, env), daemon=True)
    thread.start()

    return jsonify({"ok": True, "status": "started"})

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
    thread = threading.Thread(target=_run_process, args=(cmd, env), daemon=True)
    thread.start()
    return jsonify({"ok": True})

@app.route("/tournaments")
def list_tournaments():
    t_dir = DATA_DIR / "tournaments"
    if not t_dir.exists():
        return jsonify([])
    files = sorted(t_dir.glob("*.json"), reverse=True)
    results = []
    for f in files[:50]:
        try:
            with open(f) as fp:
                d = json.load(fp)
            results.append({
                "id":       f.stem,
                "run_at":   d.get("run_at"),
                "task":     d.get("task", "")[:120],
                "judge":    d.get("judge"),
                "winner":   d["ranking"][0]["model"] if d.get("ranking") else None,
                "models":   len(d.get("ranking", [])),
            })
        except Exception:
            continue
    return jsonify(results)

@app.route("/tournament/<tournament_id>")
def get_tournament(tournament_id: str):
    f = DATA_DIR / "tournaments" / f"{tournament_id}.json"
    if not f.exists():
        return jsonify({"error": "not found"}), 404
    try:
        with open(f) as fp:
            return jsonify(json.load(fp))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/events/history")
def events_history():
    return jsonify(_events[-500:])

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5001)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()
    app.run(host=args.host, port=args.port, threaded=True)
