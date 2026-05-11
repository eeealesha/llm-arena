"""
Prompt-evolution main loop.

Architecture (Promptbreeder + GEPA hybrid):
  1. Load (or seed) lineage for the theme.
  2. For each generation:
       a) Pick N parents from the Pareto frontier (stochastic).
       b) Apply a mutation operator to each parent → child prompt.
       c) Minibatch evaluate each child:
            - K contestant LLMs each write a post using the child prompt.
            - Judge LLM scores every post on the 4 criteria + writes per-post feedback.
       d) Update the child's fitness and add to the lineage.
       e) Mark the Pareto frontier.
  3. Persist lineage after every successful evaluation.

The whole loop emits newline-delimited JSON events for the Flask /stream SSE feed.
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
)
from mutations import ALL_OPERATORS, apply_operator


# ── Author / Judge prompts ────────────────────────────────────────────────
SYSTEM_AUTHOR = (
    "Ты — профессиональный автор. Пиши на русском, конкретно, без воды. "
    "Возвращай ТОЛЬКО готовый пост, без преамбулы и пояснений."
)

JUDGE_RUBRIC_REFLECTIVE = (
    "Ты — строгий редактор. Оцени пост по 4 критериям от 1 до 5:\n"
    "  • engagement — захватывает ли внимание\n"
    "  • informativeness — конкретные факты, инструменты, цифры\n"
    "  • accuracy — фактическая корректность, нет ли галлюцинаций\n"
    "  • originality — свежий угол зрения\n\n"
    "Ответь строго в JSON без markdown:\n"
    '{"scores": {"engagement":X,"informativeness":X,"accuracy":X,"originality":X}, '
    '"feedback": "1-2 предложения: что сильно, что слабо"}'
)


def _emit(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def _parse_judge_reply(reply: str) -> tuple[dict, str]:
    """Extract scores dict and feedback text from judge reply. Falls back to neutral."""
    try:
        cleaned = re.sub(r"```(?:json)?|```", "", reply).strip()
        data = json.loads(cleaned)
        scores = {c: int(data["scores"].get(c, 3)) for c in CRITERIA}
        feedback = str(data.get("feedback", "")).strip()[:300]
        return scores, feedback
    except Exception:
        return {c: 3 for c in CRITERIA}, "не удалось распарсить ответ судьи"


def _evaluate_prompt(
    *,
    prompt_text: str,
    theme_label: str,
    contestants: list[str],
    judge: str,
    ask,                 # ask(model, prompt, system, timeout) → (reply, elapsed)
    judge_timeout: int,
) -> list[dict]:
    """Run minibatch: every contestant writes a post, judge scores them."""
    scored = []
    for model in contestants:
        _emit({"type": "minibatch_post_start", "model": model})
        post, t = ask(model, f"Тема: {theme_label}\n\n{prompt_text}", SYSTEM_AUTHOR, 120)
        if not post:
            _emit({"type": "minibatch_post_failed", "model": model})
            continue
        _emit({"type": "minibatch_post_done", "model": model, "words": len(post.split()), "time": t})

        # Judge it
        judge_user = f"=== ПОСТ ===\n{post}"
        reply, _ = ask(judge, judge_user, JUDGE_RUBRIC_REFLECTIVE, judge_timeout)
        if not reply:
            continue
        scores, feedback = _parse_judge_reply(reply)
        _emit({"type": "minibatch_judged", "model": model, "scores": scores, "feedback": feedback})
        scored.append({
            "model": model,
            "criterion_scores": scores,
            "feedback": feedback,
            "post": post,
        })
    return scored


def _aggregate_feedback(scored: list[dict]) -> str:
    """Compact feedback summary across all evaluations (used for next-gen reflection)."""
    if not scored:
        return ""
    parts = []
    for s in scored:
        short = s["model"].split(":")[0].split("/")[-1]
        parts.append(f"[{short}] {s['feedback']}")
    return " · ".join(parts)[:600]


# ── Main run ──────────────────────────────────────────────────────────────
def run_evolve(
    *,
    theme: str,
    base_task: str,
    contestants: list[str],
    judge: str,
    generations: int,
    candidates_per_gen: int,
    operators: list[str],
    seed: int,
    data_dir: pathlib.Path,
    ask,                 # callable
    judge_timeout: int = 180,
):
    rng = random.Random(seed)
    theme_slug = slugify(theme)

    lineage = load_lineage(data_dir, theme_slug)
    if not lineage.get("theme_label"):
        lineage["theme_label"] = theme

    # Seed generation 0 if empty
    if not lineage["prompts"]:
        seed_prompt = add_prompt(
            lineage,
            text=base_task,
            parent_id=None,
            mutation_op="seed",
            generation=0,
        )
        _emit({"type": "evolve_start", "theme": theme, "theme_slug": theme_slug,
               "generations": generations, "candidates_per_gen": candidates_per_gen,
               "contestants": contestants, "judge": judge, "operators": operators,
               "seed_prompt_id": seed_prompt["id"]})

        # Evaluate seed
        _emit({"type": "prompt_evaluating", "id": seed_prompt["id"],
               "generation": 0, "op": "seed"})
        scored = _evaluate_prompt(
            prompt_text=seed_prompt["text"], theme_label=theme,
            contestants=contestants, judge=judge, ask=ask, judge_timeout=judge_timeout,
        )
        if scored:
            from lineage import update_fitness
            update_fitness(seed_prompt, scored)
            seed_prompt["feedback_summary"] = _aggregate_feedback(scored)
        mark_pareto(lineage)
        record_generation(lineage, 0, [seed_prompt["id"]])
        save_lineage(data_dir, lineage)
        _emit({"type": "prompt_evaluated", "id": seed_prompt["id"],
               "fitness": seed_prompt["fitness"], "is_pareto": seed_prompt["is_pareto"]})

        start_gen = 1
    else:
        # Resume: continue from highest generation + 1
        start_gen = max((g["gen"] for g in lineage["generations"]), default=0) + 1
        _emit({"type": "evolve_start", "theme": theme, "theme_slug": theme_slug,
               "generations": generations, "candidates_per_gen": candidates_per_gen,
               "contestants": contestants, "judge": judge, "operators": operators,
               "resumed_from_gen": start_gen})

    from lineage import update_fitness

    for g in range(start_gen, start_gen + generations):
        _emit({"type": "generation_start", "gen": g, "candidates": candidates_per_gen})

        parents = select_parents_for_mutation(lineage, candidates_per_gen, rng)
        added_ids: list[str] = []

        for parent in parents:
            op = rng.choice(operators)
            _emit({"type": "mutation_attempt", "gen": g, "op": op,
                   "parent_id": parent["id"]})

            # Use the judge as the "mutator LLM" — strong reasoning available.
            def _ask_text(user: str, system: str) -> Optional[str]:
                r, _t = ask(judge, user, system, 120)
                return r

            new_text = apply_operator(op, parent, theme, _ask_text, rng)
            if not new_text or len(new_text) < 20:
                _emit({"type": "mutation_failed", "gen": g, "op": op,
                       "parent_id": parent["id"], "reason": "empty_or_short"})
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
            _emit({"type": "mutation_done", "gen": g, "op": op,
                   "parent_id": parent["id"], "id": child["id"],
                   "text": child["text"]})

            _emit({"type": "prompt_evaluating", "id": child["id"],
                   "generation": g, "op": op})
            scored = _evaluate_prompt(
                prompt_text=child["text"], theme_label=theme,
                contestants=contestants, judge=judge,
                ask=ask, judge_timeout=judge_timeout,
            )
            if scored:
                update_fitness(child, scored)
                child["feedback_summary"] = _aggregate_feedback(scored)
            mark_pareto(lineage)
            save_lineage(data_dir, lineage)
            added_ids.append(child["id"])
            _emit({"type": "prompt_evaluated", "id": child["id"],
                   "fitness": child["fitness"], "is_pareto": child["is_pareto"]})

        record_generation(lineage, g, added_ids)
        save_lineage(data_dir, lineage)

        # Snapshot of current Pareto frontier (for live UI)
        pareto = [p["id"] for p in lineage["prompts"] if p.get("is_pareto")]
        _emit({"type": "generation_done", "gen": g, "added_ids": added_ids,
               "pareto_ids": pareto})

    _emit({"type": "evolve_done", "theme_slug": theme_slug,
           "total_prompts": len(lineage["prompts"]),
           "generations_completed": start_gen + generations - 1})
