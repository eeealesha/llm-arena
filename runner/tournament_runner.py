"""
Tournament runner — extracts all logic from llm_elo_tournament.ipynb.
Emits newline-delimited JSON events to stdout for SSE streaming.
Human-readable logs go to stderr.
"""
import argparse
import json
import math
import os
import pathlib
import random
import re
import sys
import time
from datetime import datetime
from math import erfc, exp, pi, sqrt
from typing import Optional

# ── Config from env ───────────────────────────────────────
HOST_URL = os.environ.get("OLLAMA_HOST", "https://ollama.com")
API_KEY  = os.environ.get("OLLAMA_API_KEY", "")
DATA_DIR = pathlib.Path(os.environ.get("DATA_DIR", "./data"))
ARTICLES_DIR = pathlib.Path(os.environ.get("ARTICLES_DIR", "./public/data/articles"))
MODELS_CACHE = DATA_DIR / "models.json"

REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "180"))
JUDGE_TIMEOUT   = int(os.environ.get("JUDGE_TIMEOUT", "240"))

# ── Event emitter ─────────────────────────────────────────
def emit(event: dict):
    print(json.dumps(event, ensure_ascii=False), flush=True)

def log(msg: str):
    print(msg, file=sys.stderr, flush=True)

# ── HTTP helpers ──────────────────────────────────────────
import requests

def _headers():
    return {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}

def ask(model: str, prompt: str, system: str = "",
        timeout: int = REQUEST_TIMEOUT) -> tuple[Optional[str], Optional[float]]:
    payload = {"model": model, "prompt": prompt, "stream": False}
    if system:
        payload["system"] = system
    try:
        t0 = time.time()
        r = requests.post(f"{HOST_URL}/api/generate",
                          json=payload, headers=_headers(), timeout=timeout)
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
        emit({"type": "model_check", "model": m["name"], "index": i + 1, "total": len(all_models)})
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

# ── TrueSkill ─────────────────────────────────────────────
TS_MU   = 25.0
TS_SIG  = TS_MU / 3
TS_BETA = TS_SIG / 2
TS_TAU  = TS_SIG / 100
CRITERIA = ["engagement", "informativeness", "accuracy", "originality"]

def _npdf(x): return exp(-x * x / 2) / sqrt(2 * pi)
def _ncdf(x): return 0.5 * erfc(-x / sqrt(2))

def ts_update(ratings: dict, winner: str, loser: str, draw: bool = False):
    mu_w, sig_w = ratings[winner]
    mu_l, sig_l = ratings[loser]
    sig_w2 = sig_w ** 2 + TS_TAU ** 2
    sig_l2 = sig_l ** 2 + TS_TAU ** 2
    c = sqrt(sig_w2 + sig_l2 + 2 * TS_BETA ** 2)
    t = (mu_w - mu_l) / c
    d = _ncdf(t)
    v = (_npdf(t) / d) if d > 1e-10 else -t
    w = v * (v + t)
    k = 0.5 if draw else 1.0
    ratings[winner] = [mu_w + k * (sig_w2 / c) * v,
                       sqrt(sig_w2 * (1 - k * (sig_w2 / c ** 2) * w))]
    ratings[loser]  = [mu_l - k * (sig_l2 / c) * v,
                       sqrt(sig_l2 * (1 - k * (sig_l2 / c ** 2) * w))]

def ts_score(mu: float, sigma: float) -> float:
    return mu - 3 * sigma

# ── Swiss pairing ─────────────────────────────────────────
def swiss_pair(standings: list, played: set) -> tuple:
    unpaired, pairs, bye = list(standings), [], None
    while len(unpaired) >= 2:
        a = unpaired.pop(0)
        for i, b in enumerate(unpaired):
            if frozenset([a, b]) not in played:
                pairs.append((a, b))
                unpaired.pop(i)
                break
        else:
            pairs.append((a, unpaired.pop(0)))
    if unpaired:
        bye = unpaired[0]
    return pairs, bye

# ── Prompts ───────────────────────────────────────────────
SYSTEM_AUTHOR = (
    "Ты — профессиональный автор канала по анализу данных и AI. "
    "Пиши на русском языке, живо и конкретно. "
    "Используй эмодзи умеренно. "
    "Пост должен быть готов к публикации без правок."
)

JUDGE_RUBRIC = (
    "Ты — строгий независимый редактор. "
    "Оцени два поста (A и B) по четырём критериям от 1 до 5:\n"
    "  • engagement    — захватывает ли внимание, есть ли крючок\n"
    "  • informativeness — конкретные данные, инструменты, примеры\n"
    "  • accuracy      — фактическая корректность, нет ли галлюцинаций\n"
    "  • originality   — свежий угол зрения, не банальщина\n\n"
    "Ответь строго в JSON без markdown-блоков:\n"
    '{"scores_a": {"engagement":X,"informativeness":X,"accuracy":X,"originality":X}, '
    '"scores_b": {"engagement":X,"informativeness":X,"accuracy":X,"originality":X}, '
    '"reasoning": "1-2 предложения почему"}'
)

COMMENTATOR_SYS = (
    "Ты — харизматичный спортивный комментатор турнира языковых моделей. "
    "Пиши живо, эмоционально, как настоящий аналитик киберспорта. "
    "Укажи кто выступил ярче всех, кто провалился, кто неожиданно вырвался вперёд. "
    "2-4 предложения, максимум интриги. Язык — русский."
)

# ── Core logic ────────────────────────────────────────────
def generate_posts(models: list, task: str) -> dict:
    posts = {}
    emit({"type": "posts_start", "total": len(models)})
    for i, model in enumerate(models, 1):
        emit({"type": "post_generating", "model": model, "index": i, "total": len(models)})
        reply, elapsed = ask(model, task, system=SYSTEM_AUTHOR)
        if reply:
            posts[model] = reply
            emit({"type": "post_done", "model": model, "words": len(reply.split()),
                  "time": elapsed, "text": reply})
        else:
            emit({"type": "post_failed", "model": model})
        time.sleep(0.3)
    return posts

def commentate_round(rnd: int, matches: list, ts_before: dict, ts_after: dict,
                     commentator_model: str) -> str:
    lines = []
    for m in matches:
        a_name = m["A"].split(":")[0].split("/")[-1]
        b_name = m["B"].split(":")[0].split("/")[-1]
        verdict = m["verdict"]
        sa = sum(m.get("scores_a", {}).values()) if m.get("scores_a") else "?"
        sb = sum(m.get("scores_b", {}).values()) if m.get("scores_b") else "?"
        winner_name = (a_name if verdict == "A" else b_name if verdict == "B" else "ничья")
        lines.append(f"{a_name} ({sa}) vs {b_name} ({sb}) → {winner_name}")

    movers = []
    for model in set(ts_after) & set(ts_before):
        delta = ts_score(*ts_after[model]) - ts_score(*ts_before[model])
        movers.append((model.split(":")[0].split("/")[-1], delta))
    movers.sort(key=lambda x: -x[1])
    top_gainer = f"{movers[0][0]} (+{movers[0][1]:.1f} TS)" if movers else "неизвестно"
    top_loser  = f"{movers[-1][0]} ({movers[-1][1]:.1f} TS)" if movers else "неизвестно"

    prompt = (
        f"Раунд {rnd} завершён. Матчи:\n" + "\n".join(lines) +
        f"\n\nЛидер раунда: {top_gainer}. Упал сильнее всех: {top_loser}."
        f"\n\nДай комментарий в стиле спортивного аналитика."
    )
    reply, _ = ask(commentator_model, prompt, system=COMMENTATOR_SYS, timeout=60)
    return reply or f"Раунд {rnd}: {len(matches)} матчей сыграно."

def do_judge(judge: str, post_a: str, post_b: str) -> tuple:
    prompt = f"=== ПОСТ A ===\n{post_a}\n\n=== ПОСТ B ===\n{post_b}\n\nОцени посты."
    reply, _ = ask(judge, prompt, system=JUDGE_RUBRIC, timeout=JUDGE_TIMEOUT)
    if not reply:
        return "DRAW", {c: 3 for c in CRITERIA}, {c: 3 for c in CRITERIA}, "нет ответа"
    try:
        data = json.loads(re.sub(r"```(?:json)?|```", "", reply).strip())
        sa = {c: int(data["scores_a"].get(c, 3)) for c in CRITERIA}
        sb = {c: int(data["scores_b"].get(c, 3)) for c in CRITERIA}
        reasoning = str(data.get("reasoning", "")).strip()
    except Exception:
        sa = sb = {c: 3 for c in CRITERIA}
        v = reply.strip().upper()
        verdict = "A" if v.startswith("A") else "B" if v.startswith("B") else "DRAW"
        return verdict, sa, sb, reply
    total_a = sum(sa.values())
    total_b = sum(sb.values())
    if total_a > total_b:   verdict = "A"
    elif total_b > total_a: verdict = "B"
    else:                   verdict = "DRAW"
    return verdict, sa, sb, reasoning

def run_swiss_tournament(contestants: list, task: str, judge: str,
                          posts: dict, n_rounds: int = None,
                          commentator: str = None) -> dict:
    n            = len(contestants)
    total_rounds = n_rounds or (math.ceil(math.log2(n)) + 1)
    ts           = {m: [TS_MU, TS_SIG] for m in contestants}
    stats        = {m: {"W": 0, "L": 0, "D": 0, "bye": 0} for m in contestants}
    crit_scores  = {m: {c: [] for c in CRITERIA} for m in contestants}
    played       = set()
    log_entries  = []
    round_comments = {}
    counter      = 0

    emit({"type": "tournament_start", "contestants": n, "rounds": total_rounds,
          "judge": judge, "commentator": commentator})

    for rnd in range(1, total_rounds + 1):
        standings = sorted(contestants, key=lambda m: -ts_score(*ts[m]))
        if rnd == 1:
            random.shuffle(standings)
        pairs, bye = swiss_pair(standings, played)

        emit({"type": "round_start", "round": rnd, "total_rounds": total_rounds,
              "pairs": [[a, b] for a, b in pairs], "bye": bye})

        ts_before_round = {m: list(v) for m, v in ts.items()}
        round_matches = []

        if bye:
            ts[bye][0] += TS_TAU
            stats[bye]["W"] += 1
            stats[bye]["bye"] += 1
            emit({"type": "bye", "round": rnd, "model": bye})

        for ma, mb in pairs:
            counter += 1
            played.add(frozenset([ma, mb]))
            emit({"type": "match_start", "round": rnd, "match": counter, "A": ma, "B": mb})
            verdict, scores_a, scores_b, reasoning = do_judge(judge, posts[ma], posts[mb])

            if verdict == "A":
                ts_update(ts, ma, mb)
                stats[ma]["W"] += 1
                stats[mb]["L"] += 1
            elif verdict == "B":
                ts_update(ts, mb, ma)
                stats[mb]["W"] += 1
                stats[ma]["L"] += 1
            else:
                ts_update(ts, ma, mb, draw=True)
                stats[ma]["D"] += 1
                stats[mb]["D"] += 1

            for c in CRITERIA:
                crit_scores[ma][c].append(scores_a[c])
                crit_scores[mb][c].append(scores_b[c])

            match_entry = {
                "round": rnd, "match": counter, "A": ma, "B": mb,
                "verdict": verdict, "reasoning": reasoning,
                "scores_a": scores_a, "scores_b": scores_b,
                "ts_a": round(ts_score(*ts[ma]), 2),
                "ts_b": round(ts_score(*ts[mb]), 2),
            }
            log_entries.append(match_entry)
            round_matches.append(match_entry)
            emit({"type": "match", **match_entry})
            time.sleep(0.3)

        # Round standings
        round_standings = [
            {"model": m, "rank": i + 1,
             "ts": round(ts_score(*ts[m]), 2),
             "mu": round(ts[m][0], 2),
             "sigma": round(ts[m][1], 2),
             **stats[m]}
            for i, m in enumerate(sorted(contestants, key=lambda m: -ts_score(*ts[m])))
        ]

        comment = None
        if commentator and round_matches:
            emit({"type": "comment_start", "round": rnd})
            comment = commentate_round(rnd, round_matches, ts_before_round, ts, commentator)
            round_comments[str(rnd)] = comment

        emit({"type": "round_end", "round": rnd, "standings": round_standings,
              "comment": comment})

    criteria_avgs = {
        m: {c: round(sum(v) / len(v), 2) if v else 0.0 for c, v in crit_scores[m].items()}
        for m in contestants
    }

    ranked = sorted(contestants, key=lambda m: -ts_score(*ts[m]))
    ranking = [
        {
            "rank": i + 1, "model": m,
            "ts_score": round(ts_score(*ts[m]), 2),
            "mu": round(ts[m][0], 2),
            "sigma": round(ts[m][1], 2),
            **stats[m],
            "criteria": criteria_avgs[m],
        }
        for i, m in enumerate(ranked)
    ]

    return {
        "ranked": ranked,
        "ts_ratings": ts,
        "stats": stats,
        "log": log_entries,
        "criteria_avgs": criteria_avgs,
        "round_comments": round_comments,
        "ranking": ranking,
    }

def critique_and_rewrite(model: str, post: str, task: str) -> tuple[str, str]:
    CRITIQUE_SYS = (
        "Ты — требовательный редактор. "
        "Тебе дадут задание и пост. "
        "Сначала напиши КРИТИКА: — что слабо, что можно улучшить (3–5 пунктов). "
        "Затем напиши УЛУЧШЕННЫЙ ПОСТ: — переписанный вариант с учётом критики. "
        "Разделяй секции именно так: КРИТИКА:\n...\n\nУЛУЧШЕННЫЙ ПОСТ:\n..."
    )
    emit({"type": "status", "message": f"Critique & rewrite by {model}"})
    reply, _ = ask(model,
                   f"ЗАДАНИЕ:\n{task}\n\nПОСТ:\n{post}\n\nПроведи разбор и перепиши пост.",
                   system=CRITIQUE_SYS, timeout=JUDGE_TIMEOUT)
    if not reply:
        return "нет ответа", post
    critique, rewritten = "", ""
    if "УЛУЧШЕННЫЙ ПОСТ:" in reply:
        parts = reply.split("УЛУЧШЕННЫЙ ПОСТ:", 1)
        rewritten = parts[1].strip()
        critique = parts[0].replace("КРИТИКА:", "").strip()
    elif "КРИТИКА:" in reply:
        critique = reply.replace("КРИТИКА:", "").strip()
        rewritten = post
    else:
        critique = reply
        rewritten = post
    return critique, rewritten

def summarize_reasoning(log_entries: list, summarizer: str, task: str) -> str:
    decisive = [m for m in log_entries if m["verdict"] != "DRAW"
                and m.get("reasoning") and m["reasoning"] != "нет ответа"]
    if not decisive:
        return "Недостаточно данных."
    lines = "\n".join(f"- {m['reasoning']}" for m in decisive[:30])
    prompt = (
        f"Задание было: «{task}»\n\n"
        f"Ниже — вердикты редактора из турнира постов:\n{lines}\n\n"
        f"Выдели 3–5 конкретных паттернов: что стабильно отличает сильные посты от слабых. "
        f"Пиши кратко, по пунктам, без воды."
    )
    emit({"type": "status", "message": f"Summarizing reasoning with {summarizer}"})
    reply, _ = ask(summarizer, prompt, timeout=JUDGE_TIMEOUT)
    return reply or "Нет резюме."

def evolve_prompt(task: str, top_models: list, reasoning_summary: str) -> str:
    EVOLVE_SYS = (
        "Ты — эксперт по prompt engineering. "
        "Тебе дадут оригинальную задачу и анализ что отличает лучшие ответы. "
        "Предложи улучшенную версию задачи. Сохрани смысл. Не более 4 предложений. "
        "Ответь ТОЛЬКО улучшенной задачей, без объяснений."
    )
    proposals = {}
    emit({"type": "status", "message": "Evolving prompt..."})
    for model in top_models:
        reply, _ = ask(model,
                       f"Задача:\n«{task}»\n\nЧто отличает лучшие посты:\n{reasoning_summary}\n\nПредложи улучшенную задачу.",
                       system=EVOLVE_SYS, timeout=JUDGE_TIMEOUT)
        if reply:
            proposals[model] = reply.strip()
        time.sleep(0.3)
    if not proposals:
        return task
    aggregator = top_models[0]
    candidates = "\n\n".join(f"[{i+1}] {p}" for i, p in enumerate(proposals.values()))
    final, _ = ask(aggregator,
                   f"Задача: «{task}»\n\nПредложения:\n{candidates}\n\nСинтезируй один финальный вариант. Ответь ТОЛЬКО задачей.",
                   system=EVOLVE_SYS, timeout=JUDGE_TIMEOUT)
    return (final or list(proposals.values())[0]).strip()

# ── Save tournament result ────────────────────────────────
def save_tournament(result: dict, output_dir: pathlib.Path = None) -> str:
    out = output_dir or (DATA_DIR / "tournaments")
    out.mkdir(parents=True, exist_ok=True)
    judge_short = result["judge"].split(":")[0].split("/")[-1]
    fname = f"tournament_iter{result['iteration']}_{judge_short}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    path = out / fname
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return str(path)

# ── Main tournament flow ──────────────────────────────────
def run_tournament(args):
    # Load contestants
    if args.models_json:
        with open(args.models_json) as f:
            contestants = json.load(f)
        if isinstance(contestants[0], dict):
            contestants = [m["name"] for m in contestants]
    else:
        available = get_available_models(force_recheck=True)
        contestants = [m["name"] for m in available]

    if args.max_contestants:
        contestants = contestants[:args.max_contestants]

    judge = args.judge or contestants[0]
    task  = args.task

    emit({"type": "config", "task": task, "judge": judge,
          "contestants": contestants, "max": args.max_contestants})

    # Generate posts
    emit({"type": "status", "message": "Generating posts..."})
    posts = generate_posts(contestants, task)
    contestants_with_posts = [m for m in contestants if m in posts]

    # Run tournament
    result = run_swiss_tournament(
        contestants_with_posts, task, judge, posts,
        n_rounds=args.swiss_rounds,
        commentator=args.commentator,
    )

    winner = result["ranked"][0]
    top_5  = result["ranked"][:5]

    # Critique & rewrite
    critique, rewrite = critique_and_rewrite(winner, posts[winner], task)
    emit({"type": "critique_done", "model": winner, "critique": critique})

    # Summarize reasoning
    reasoning_summary = summarize_reasoning(result["log"], winner, task)
    emit({"type": "reasoning_summary", "summary": reasoning_summary})

    # Evolve prompt
    evolved_task = evolve_prompt(task, top_5, reasoning_summary)
    emit({"type": "evolved_prompt", "original": task, "evolved": evolved_task})

    # Build final result
    iteration = args.iteration or 1
    final = {
        "iteration":         iteration,
        "run_at":            datetime.now().isoformat(),
        "task":              task,
        "evolved_task":      evolved_task,
        "judge":             judge,
        "ranking":           result["ranking"],
        "posts":             posts,
        "winner_critique":   critique,
        "winner_rewrite":    rewrite,
        "match_log":         result["log"],
        "reasoning_summary": reasoning_summary,
        "criteria_avgs":     result["criteria_avgs"],
        "round_comments":    result["round_comments"],
    }

    path = save_tournament(final)
    tournament_id = pathlib.Path(path).stem

    emit({"type": "done", "tournament_id": tournament_id, "path": path,
          "winner": winner, "ranking": result["ranking"][:5]})
    return final

# ── Article generation ────────────────────────────────────
SYSTEM_PLANNER = (
    "Ты — Планёр редакции. "
    "Придумай структуру и ключевые тезисы будущей статьи. "
    "Напиши план: заголовок, 3-5 разделов с кратким описанием, главный тезис. "
    "Пиши ёмко, по делу. Язык — русский."
)
SYSTEM_STORYTELLER = (
    "Ты — Автор-сторителлер. "
    "Напиши живую, захватывающую статью по плану. "
    "Используй истории, метафоры, конкретные примеры. "
    "Верни ТОЛЬКО готовый текст статьи, без вступлений и пояснений. Язык — русский."
)
SYSTEM_ANALYST = (
    "Ты — Автор-аналитик. "
    "Напиши глубокую аналитическую статью по плану. "
    "Используй факты, данные, конкретные цифры. "
    "Верни ТОЛЬКО готовый текст статьи, без вступлений и пояснений. Язык — русский."
)
SYSTEM_EDITOR = (
    "Ты — Редактор. "
    "Проверь и улучши статью: исправь фактические ошибки, улучши структуру, убери воду. "
    "Верни ТОЛЬКО исправленный текст статьи, без комментариев и пояснений. Язык — русский."
)
SYSTEM_CHIEF = (
    "Ты — Выпускающий редактор. "
    "Сделай финальную правку: убедись что статья цепляет с первых строк, "
    "вывод сильный, заголовок точный. "
    "Верни ТОЛЬКО финальный текст статьи, без комментариев и пояснений. Язык — русский."
)

def write_article(topic: str, roles: dict, author_style: str = "storyteller",
                  n_iterations: int = 2) -> dict:
    emit({"type": "article_start", "topic": topic, "style": author_style})

    planner_model = roles["planner"]
    author_model  = roles[author_style]
    editor_model  = roles["editor"]
    chief_model   = roles["chief_editor"]
    history = []

    # 1. Plan
    emit({"type": "article_step", "step": "planner", "model": planner_model})
    plan, t = ask(planner_model, f"Тема статьи: {topic}", system=SYSTEM_PLANNER)
    if not plan:
        emit({"type": "error", "message": "Planner failed"})
        return {}
    history.append({"role": "planner", "model": planner_model, "text": plan})
    emit({"type": "article_step_done", "step": "planner", "model": planner_model,
          "words": len(plan.split()), "time": t})

    # 2. Author draft
    author_sys = SYSTEM_STORYTELLER if author_style == "storyteller" else SYSTEM_ANALYST
    draft_prompt = f"Тема: {topic}\n\nПлан:\n{plan}\n\nНапиши статью."
    emit({"type": "article_step", "step": "author_draft", "model": author_model})
    draft, t = ask(author_model, draft_prompt, system=author_sys, timeout=JUDGE_TIMEOUT)
    if not draft:
        emit({"type": "error", "message": "Author failed"})
        return {}
    history.append({"role": "author_draft", "model": author_model, "text": draft})
    current_text = draft
    emit({"type": "article_step_done", "step": "author_draft", "model": author_model,
          "words": len(draft.split()), "time": t})

    # 3. Editor iterations
    for i in range(n_iterations):
        emit({"type": "article_step", "step": f"editor_v{i+1}", "model": editor_model})
        edited, t = ask(editor_model,
                        f"Тема: {topic}\n\nСтатья:\n{current_text}\n\nОтредактируй.",
                        system=SYSTEM_EDITOR, timeout=JUDGE_TIMEOUT)
        if edited:
            current_text = edited
            history.append({"role": f"editor_v{i+1}", "model": editor_model, "text": edited})
            emit({"type": "article_step_done", "step": f"editor_v{i+1}",
                  "model": editor_model, "words": len(edited.split()), "time": t})

        if i < n_iterations - 1:
            emit({"type": "article_step", "step": f"author_v{i+2}", "model": author_model})
            revised, t = ask(author_model,
                             f"Тема: {topic}\n\nОтредактированный черновик:\n{current_text}\n\nУлучши и расширь.",
                             system=author_sys, timeout=JUDGE_TIMEOUT)
            if revised:
                current_text = revised
                history.append({"role": f"author_v{i+2}", "model": author_model, "text": revised})
                emit({"type": "article_step_done", "step": f"author_v{i+2}",
                      "model": author_model, "words": len(revised.split()), "time": t})

    # 4. Chief editor
    emit({"type": "article_step", "step": "chief_editor", "model": chief_model})
    final, t = ask(chief_model,
                   f"Тема: {topic}\n\nСтатья:\n{current_text}\n\nСделай финальную правку.",
                   system=SYSTEM_CHIEF, timeout=JUDGE_TIMEOUT)
    if final:
        current_text = final
        history.append({"role": "chief_editor", "model": chief_model, "text": final})
        emit({"type": "article_step_done", "step": "chief_editor", "model": chief_model,
              "words": len(final.split()), "time": t})

    # Save
    slug = re.sub(r"[^a-z0-9а-яё\-]", "-", topic.lower().replace(" ", "-"))[:60]
    slug = re.sub(r"-+", "-", slug).strip("-")
    article_id = f"{datetime.now().strftime('%Y%m%d')}_{slug}"

    article = {
        "id":           article_id,
        "topic":        topic,
        "author_style": author_style,
        "published_at": datetime.now().isoformat(),
        "verified_by":  "Алексей Гавриlov",
        "roles": {
            "planner":      planner_model,
            "author":       author_model,
            "editor":       editor_model,
            "chief_editor": chief_model,
        },
        "final_text": current_text,
        "history":    history,
    }

    ARTICLES_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ARTICLES_DIR / f"{article_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(article, f, ensure_ascii=False, indent=2)

    emit({"type": "article_done", "id": article_id, "words": len(current_text.split()),
          "path": str(out_path)})
    return article

REQUIRED_ROLES = ("planner", "storyteller", "analyst", "editor", "chief_editor")

def _fill_missing_roles(roles: dict, fallback: str) -> dict:
    return {k: roles.get(k) or fallback for k in REQUIRED_ROLES}

def run_article(args):
    # 1. Explicit roles from frontend take precedence
    if args.roles_json:
        roles = json.loads(args.roles_json)
        if not any(roles.get(k) for k in REQUIRED_ROLES):
            emit({"type": "error", "message": "Roles JSON is empty"})
            return
        fallback = next((v for v in roles.values() if v), None)
        roles = _fill_missing_roles(roles, fallback)
        write_article(args.topic, roles, author_style=args.style,
                      n_iterations=args.iterations)
        return

    # 2. Otherwise derive roles from a tournament file
    if args.tournament_file:
        with open(args.tournament_file) as f:
            t = json.load(f)
        ranked = [(r["model"], r.get("ts_score") or r.get("elo", 0)) for r in t["ranking"]]
        criteria_avgs = t.get("criteria_avgs", {})
    else:
        # Find latest tournament with criteria_avgs
        tournaments_dir = DATA_DIR / "tournaments"
        files = sorted(tournaments_dir.glob("*.json"), reverse=True)
        ranked, criteria_avgs = None, {}
        for p in files:
            with open(p) as f:
                t = json.load(f)
            if t.get("criteria_avgs") and t.get("ranking"):
                ranked = [(r["model"], r.get("ts_score") or r.get("elo", 0)) for r in t["ranking"]]
                criteria_avgs = t["criteria_avgs"]
                break
        if not ranked:
            emit({"type": "error", "message": "No tournament with criteria_avgs found"})
            return

    roles = assign_editorial_roles(criteria_avgs, ranked)
    if not roles:
        # Fallback: use top-ranked model for every role
        first = ranked[0][0] if ranked else None
        if not first:
            emit({"type": "error", "message": "No models available for article"})
            return
        roles = _fill_missing_roles({}, first)
    write_article(args.topic, roles, author_style=args.style,
                  n_iterations=args.iterations)

def assign_editorial_roles(criteria_avgs: dict, ranked: list) -> dict:
    models = [m for m, _ in ranked if m in criteria_avgs]
    if not models:
        return {}
    chief_editor = ranked[0][0]
    editor       = max(models, key=lambda m: criteria_avgs[m]["accuracy"])
    storyteller  = max(models, key=lambda m: criteria_avgs[m]["engagement"] + criteria_avgs[m]["originality"])
    analyst      = max(models, key=lambda m: criteria_avgs[m]["informativeness"] + criteria_avgs[m]["accuracy"])
    planner      = max(models, key=lambda m: criteria_avgs[m]["originality"])
    return {
        "chief_editor": chief_editor,
        "editor":       editor,
        "storyteller":  storyteller,
        "analyst":      analyst,
        "planner":      planner,
    }

# ── CLI ───────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")

    # tournament subcommand
    t_parser = sub.add_parser("tournament")
    t_parser.add_argument("--task", required=True)
    t_parser.add_argument("--judge", default=None)
    t_parser.add_argument("--models-json", default=None)
    t_parser.add_argument("--max-contestants", type=int, default=None)
    t_parser.add_argument("--swiss-rounds", type=int, default=None)
    t_parser.add_argument("--commentator", default=None)
    t_parser.add_argument("--iteration", type=int, default=1)

    # article subcommand
    a_parser = sub.add_parser("article")
    a_parser.add_argument("--topic", required=True)
    a_parser.add_argument("--tournament-file", default=None)
    a_parser.add_argument("--roles-json", default=None)
    a_parser.add_argument("--style", choices=["storyteller", "analyst"], default="storyteller")
    a_parser.add_argument("--iterations", type=int, default=2)

    # models subcommand
    m_parser = sub.add_parser("models")
    m_parser.add_argument("--recheck", action="store_true")

    args = parser.parse_args()

    if args.cmd == "tournament":
        run_tournament(args)
    elif args.cmd == "article":
        run_article(args)
    elif args.cmd == "models":
        available = get_available_models(force_recheck=args.recheck)
        emit({"type": "models_list", "models": available})
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
