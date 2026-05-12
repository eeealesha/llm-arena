"""
Prompt mutation operators — full PromptBreeder suite.

Based on: Fernando et al., "PromptBreeder: Self-Referential Self-Improvement
Via Prompt Evolution" (arXiv:2309.16797, 2023).
Reference implementation: github.com/vaughanlove/PromptBreeder

Operators implemented (9 total):
  zero_order      — generate fresh prompt from theme only (ZOHM seed variant)
  first_order     — mutate parent with a sampled mutation-prompt (FOHM)
  hyper           — invent a new mutation-op, then apply it (self-referential)
  lamarckian      — reverse-engineer a prompt from one successful output
  eda             — Estimation of Distribution: synthesise from top-N population
  eda_rank_index  — EDA with explicit ranking context
  lineage_based   — follow the ancestor chain, extrapolate next generation
  crossover       — combine best elements of two parents
  workbook        — reverse-engineer from multiple high-quality outputs

Every operator now returns a MutationResult (not just str), which carries:
  • text           — the new prompt text
  • mutation_prompt — the exact user-message sent to the LLM (transparency)
  • thinking_style — thinking style applied (if any)
  • target_metric  — which criterion we're trying to improve
  • hypothesis     — one-sentence reason for this mutation choice
"""
from __future__ import annotations
import random
import re
from dataclasses import dataclass, field
from typing import Callable, List, Optional


# ── MutationResult ────────────────────────────────────────────────────────
@dataclass
class MutationResult:
    """Carries the new prompt text plus full provenance metadata."""
    text:           str
    mutation_prompt: str               # what was sent to the LLM
    thinking_style: Optional[str] = None
    target_metric:  Optional[str] = None
    hypothesis:     str            = ""

    def to_dict(self) -> dict:
        return {
            "mutation_prompt": self.mutation_prompt,
            "thinking_style":  self.thinking_style,
            "target_metric":   self.target_metric,
            "hypothesis":      self.hypothesis,
        }


# ── Seed mutation prompts (FOHM pool) — grouped by target criterion ───────
MUTATION_PROMPTS_BY_CRITERION: dict[str, list[str]] = {
    "density": [
        "Make the instruction shorter and sharper; remove all filler.",
        "Add a constraint: no passive voice, no hedging phrases.",
        "Constrain the response to under 250 words.",
        "Demand zero AI-speak: ban 'certainly', 'great question', 'in conclusion'.",
    ],
    "specificity": [
        "Rewrite to require numbers and real named examples — ban vague generalities.",
        "Demand that every claim be backed by a concrete example or a number.",
        "Ask for a comparison between two competing named approaches.",
        "Require at least one counter-intuitive implication of the topic.",
    ],
    "instruction_following": [
        "Add a required structure: question → analysis → concrete conclusion.",
        "Rewrite as a 5-step checklist the author must follow.",
        "Require a clear call-to-action in the last sentence.",
        "Add an originality criterion: 'show an angle nobody else uses'.",
    ],
    "logic_accuracy": [
        "Strengthen the accuracy requirement; demand verifiable sources or real citations.",
        "Require the author to steelman the opposite view before concluding.",
        "Ask for the strongest counter-argument to the mainstream answer.",
        "Demand that any statistics cited be attributable to a named study or organisation.",
    ],
}

# Flat list for operators that don't need criterion-targeting
SEED_MUTATION_PROMPTS: list[str] = [
    p for prompts in MUTATION_PROMPTS_BY_CRITERION.values() for p in prompts
]

# ── Thinking-style seeds (Appendix G of PromptBreeder paper) ──────────────
SEED_THINKING_STYLES: list[str] = [
    "Think step by step.",
    "Find analogies in adjacent fields.",
    "What would a median practitioner miss?",
    "What are the three most common beginner mistakes?",
    "If Andrei Karpathy were explaining this — what would he say?",
    "What question is more important than the task itself?",
    "What is the counter-argument to the mainstream answer?",
    "What would still matter in 10 years?",
    "Approach from the inverse: what should NOT be done?",
    "What fact would surprise even an expert?",
    "What assumption is everyone making without realising it?",
    "Decompose into first principles.",
]


def _clean(s: str) -> str:
    """Strip common meta-prefixes that LLMs add before their answer."""
    s = s.strip().strip("«»\"' ")
    for prefix in (
        "Here's the improved instruction:", "Here's the prompt:",
        "Вот улучшенная задача:", "Улучшенная задача:", "Новая задача:",
        "Задача:", "Промпт:", "Инструкция:", "INSTRUCTION:", "INSTRUCTION MUTANT:",
        "Here's", "Here is", "Sure:", "Sure,", "Certainly,", "Certainly!",
    ):
        if s.lower().startswith(prefix.lower()):
            s = s[len(prefix):].strip().strip("«»\"' ")
    if len(s) > 3 and s[0].isdigit() and s[1] in (".", ")"):
        s = s[2:].strip()
    return s


# ── Theme-anchor constraint ────────────────────────────────────────────────
_THEME_ANCHOR = (
    "IMPORTANT: the original topic is «{theme}». "
    "The new instruction MUST stay on this topic. "
    "Only change structure, format, style, focus, or constraints — "
    "NEVER change the subject matter."
)


def _weakest_criterion(fitness: dict) -> Optional[str]:
    """Return the criterion with the lowest score in the parent's fitness."""
    from lineage import CRITERIA  # local import to avoid circular
    if not fitness or not fitness.get("n_evals"):
        return None
    return min(CRITERIA, key=lambda c: fitness.get(c, 0))


def _pick_mutation_for_criterion(
    criterion: Optional[str],
    rng: random.Random,
) -> str:
    """Pick a mutation prompt that targets the given criterion (or random)."""
    if criterion and criterion in MUTATION_PROMPTS_BY_CRITERION:
        pool = MUTATION_PROMPTS_BY_CRITERION[criterion]
    else:
        pool = SEED_MUTATION_PROMPTS
    return rng.choice(pool)


# ── Operator implementations ───────────────────────────────────────────────

def op_zero_order(
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    Zero-Order Hyper-Mutation (ZOHM seed variant, §3.1).
    Generate a fresh prompt from the theme description alone — no parent.
    """
    style = rng.choice(SEED_THINKING_STYLES)
    sys = (
        "You are a prompt engineering expert. Write a concise instruction for an AI author "
        "on the given topic. The instruction must be specific, 2–4 sentences. "
        "Reply with ONLY the instruction — no preamble, no explanation.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"Topic: «{theme_label}»\n\nThinking style to apply: «{style}»"
    reply = ask(user, sys)
    if not reply:
        return None
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=style,
        target_metric=None,
        hypothesis=f"Генерирую свежий промпт для темы «{theme_label}» со стилем мышления: «{style}».",
    )


def op_first_order(
    parent_text: str,
    parent_fitness: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    First-Order Hyper-Mutation (FOHM, §3.1).
    Mutate the parent using a mutation-prompt biased toward the weakest criterion.
    """
    target = _weakest_criterion(parent_fitness)
    mut = _pick_mutation_for_criterion(target, rng)
    sys = (
        "You are a prompt engineering expert. Apply the given mutation operation to "
        "the instruction and return the improved version. "
        "Reply with ONLY the new instruction, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"TOPIC: {theme_label}\n\nINSTRUCTION:\n{parent_text}\n\nMUTATION:\n{mut}"
    reply = ask(user, sys)
    if not reply:
        return None
    score_str = f"{parent_fitness.get(target, 0):.1f}/10" if target else "—"
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=target,
        hypothesis=(
            f"Применяю мутацию «{mut[:70]}». "
            f"Целевой критерий: {target or 'general'} ({score_str} у родителя)."
        ),
    )


def op_hyper(
    parent_text: str,
    parent_fitness: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    Self-Referential Hyper-Mutation (§3.2).
    Step 1: invent a new mutation operation.
    Step 2: apply the invented operation to the parent prompt.
    """
    meta = rng.choice(SEED_MUTATION_PROMPTS)
    sys1 = (
        "You are an expert in evolutionary algorithms and prompt engineering. "
        "You are given an example mutation operation. Invent a NEW mutation operation.\n\n"
        "STRICT CONSTRAINT: the operation must only change structure, format, tone, "
        "length, or rhetorical style of an instruction. It MUST NOT change the topic. "
        "Forbidden: 'change the topic', 'use an example from X', 'apply to another domain'.\n\n"
        "Reply with one sentence — the operation itself."
    )
    new_mut = ask(meta, sys1)
    if not new_mut:
        return None
    new_mut = _clean(new_mut)

    sys2 = (
        "You are a prompt engineering expert. Apply the mutation operation to the instruction. "
        "Reply with ONLY the new instruction, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"TOPIC: {theme_label}\n\nINSTRUCTION:\n{parent_text}\n\nOPERATION:\n{new_mut}"
    reply = ask(user, sys2)
    if not reply:
        return None
    target = _weakest_criterion(parent_fitness)
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=target,
        hypothesis=(
            f"Самоссылочная мутация. Изобретённая операция: «{new_mut[:80]}». "
            f"Целевой критерий: {target or 'general'}."
        ),
    )


def op_lamarckian(
    parent_text: str,
    parent_fitness: dict,
    theme_label: str,
    successful_output: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    Lamarckian Mutation (§3.3).
    Reverse-engineer a prompt from one high-scoring response.
    """
    sys = (
        "You are a prompt engineering expert. Given a topic and an example of an "
        "excellent response, infer the instruction that would CONSISTENTLY produce "
        "such quality for ANY input on this topic. "
        "The instruction must be universal — not a summary of the example.\n\n"
        "Reply with ONLY the instruction, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = (
        f"TOPIC: {theme_label}\n\n"
        f"ORIGINAL INSTRUCTION:\n{parent_text}\n\n"
        f"HIGH-QUALITY OUTPUT (produced by this instruction):\n{successful_output[:1500]}\n\n"
        "What instruction would reliably produce this level of quality?"
    )
    reply = ask(user, sys)
    if not reply:
        return None
    target = _weakest_criterion(parent_fitness)
    words = len(successful_output.split())
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=target,
        hypothesis=(
            f"Реверс-инжиниринг из лучшего ответа ({words} слов). "
            f"Целевой критерий: {target or 'general'}."
        ),
    )


def op_eda(
    theme_label: str,
    population: list[dict],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
    top_n: int = 5,
) -> Optional[MutationResult]:
    """
    Estimation of Distribution Mutation (EDA, §3.3).
    Synthesise from patterns in top-N scored prompts.
    """
    scored = sorted(
        [p for p in population if p.get("fitness", {}).get("n_evals")],
        key=lambda p: p["fitness"].get("avg_score", 0),
        reverse=True,
    )[:top_n]

    if not scored:
        return op_zero_order(theme_label, ask, rng)

    examples = "\n".join(f"• {p['text']}" for p in scored)
    sys = (
        "You are a prompt engineering expert. Study the top-performing prompts below "
        "and generate a NEW, IMPROVED prompt that captures their best patterns "
        "while going beyond all of them.\n"
        "Reply with ONLY the new prompt, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"TOPIC: {theme_label}\n\nTOP-PERFORMING PROMPTS:\n{examples}\n\nGenerate a better prompt:"
    reply = ask(user, sys)
    if not reply:
        return None
    avg_top = sum(p["fitness"].get("avg_score", 0) for p in scored) / len(scored)
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=None,
        hypothesis=(
            f"EDA: синтез из топ-{len(scored)} промптов популяции "
            f"(средний avg {avg_top:.2f}/10)."
        ),
    )


def op_eda_rank_index(
    theme_label: str,
    population: list[dict],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
    top_n: int = 5,
) -> Optional[MutationResult]:
    """
    EDA Rank-and-Index Mutation (§3.3).
    Like EDA but shows explicit rank + score, asking to beat rank-1.
    """
    scored = sorted(
        [p for p in population if p.get("fitness", {}).get("n_evals")],
        key=lambda p: p["fitness"].get("avg_score", 0),
        reverse=True,
    )[:top_n]

    if not scored:
        return op_zero_order(theme_label, ask, rng)

    ranked = "\n".join(
        f"{i+1}. [score {p['fitness'].get('avg_score', 0):.2f}] {p['text']}"
        for i, p in enumerate(scored)
    )
    sys = (
        "You are a prompt engineering expert. Below is a ranked list of prompts "
        "(rank 1 = best score). "
        "Analyse what makes rank 1 better than rank N. "
        "Then generate a prompt that would score HIGHER than rank 1.\n"
        "Reply with ONLY the new prompt, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"TOPIC: {theme_label}\n\nRANKED PROMPTS:\n{ranked}\n\nGenerate a superior prompt:"
    reply = ask(user, sys)
    if not reply:
        return None
    top_score = scored[0]["fitness"].get("avg_score", 0)
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=None,
        hypothesis=(
            f"EDA-ранг: цель — превзойти промпт #1 (score {top_score:.2f}/10). "
            f"Использовано {len(scored)} промптов с явным ранжированием."
        ),
    )


def op_lineage_based(
    parent_text: str,
    parent_fitness: dict,
    theme_label: str,
    ancestors: list[str],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    Lineage-Based Mutation (§3.3).
    Expose the full ancestor chain and extrapolate the next step.
    """
    if not ancestors:
        return op_first_order(parent_text, parent_fitness, theme_label, ask, rng)

    history = "\n".join(
        f"  gen {i}: {t}" for i, t in enumerate(ancestors[-6:])
    )
    sys = (
        "You are a prompt engineering expert studying prompt evolution. "
        "You can see the evolutionary history of a prompt lineage. "
        "Identify the direction of improvement and generate the NEXT generation "
        "that continues the trend.\n"
        "Reply with ONLY the next-generation prompt, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = (
        f"TOPIC: {theme_label}\n\n"
        f"EVOLUTION HISTORY (oldest → newest):\n{history}\n"
        f"  current: {parent_text}\n\n"
        f"Generate the next evolution:"
    )
    reply = ask(user, sys)
    if not reply:
        return None
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=None,
        hypothesis=(
            f"Линейная эволюция: экстраполяция из {len(ancestors)} поколений предков."
        ),
    )


def op_crossover(
    parent_a: str,
    parent_b: str,
    parent_a_fitness: dict,
    parent_b_fitness: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    Prompt Crossover.
    Combine the strongest elements of two parent prompts.
    """
    sys = (
        "You are a prompt engineering expert. Combine the strongest elements of two "
        "prompts into a single offspring that is better than either parent. "
        "Take the best structural idea from one and the best constraint from the other.\n"
        "Reply with ONLY the combined prompt, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = (
        f"TOPIC: {theme_label}\n\n"
        f"PROMPT A:\n{parent_a}\n\n"
        f"PROMPT B:\n{parent_b}\n\n"
        f"Combine the best of both:"
    )
    reply = ask(user, sys)
    if not reply:
        return None
    score_a = parent_a_fitness.get("avg_score", 0) if parent_a_fitness else 0
    score_b = parent_b_fitness.get("avg_score", 0) if parent_b_fitness else 0
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=None,
        hypothesis=(
            f"Кроссовер: объединяю промпт A (avg {score_a:.2f}) "
            f"и промпт B (avg {score_b:.2f})."
        ),
    )


def op_workbook(
    parent_text: str,
    parent_fitness: dict,
    theme_label: str,
    good_outputs: list[str],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[MutationResult]:
    """
    Workbook Mutation (multi-output Lamarckian, §3.3 extension).
    Reverse-engineer from MULTIPLE high-scoring outputs.
    """
    if not good_outputs:
        return op_first_order(parent_text, parent_fitness, theme_label, ask, rng)

    examples = "\n\n---\n\n".join(
        f"[Example {i+1}]\n{o[:600]}" for i, o in enumerate(good_outputs[:3])
    )
    sys = (
        "You are a prompt engineering expert. Given multiple examples of excellent "
        "AI responses, infer the IDEAL instruction that would consistently produce "
        "such quality. The instruction must be generic and reusable — not a summary "
        "of the examples themselves.\n"
        "Reply with ONLY the inferred instruction, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = (
        f"TOPIC: {theme_label}\n\n"
        f"EXAMPLES OF HIGH-QUALITY OUTPUTS:\n{examples}\n\n"
        f"What instruction would reliably produce such outputs?"
    )
    reply = ask(user, sys)
    if not reply:
        return None
    target = _weakest_criterion(parent_fitness)
    return MutationResult(
        text=_clean(reply),
        mutation_prompt=user,
        thinking_style=None,
        target_metric=target,
        hypothesis=(
            f"Workbook: реверс-инжиниринг из {len(good_outputs[:3])} качественных ответов. "
            f"Целевой критерий: {target or 'general'}."
        ),
    )


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_ancestor_texts(prompt: dict, all_prompts: list[dict]) -> list[str]:
    """Walk parent_id chain; return texts oldest → newest (excluding current)."""
    by_id = {p["id"]: p for p in all_prompts}
    chain: list[str] = []
    current = prompt
    seen: set[str] = set()
    while current.get("parent_id"):
        pid = current["parent_id"]
        if pid in seen:
            break
        seen.add(pid)
        parent = by_id.get(pid)
        if not parent:
            break
        chain.append(parent["text"])
        current = parent
    chain.reverse()
    return chain


def _get_good_outputs(prompts: list[dict], top_n: int = 3) -> list[str]:
    """Collect sample outputs from the top-N scored prompts (for workbook op)."""
    scored = sorted(
        [p for p in prompts
         if p.get("fitness", {}).get("n_evals") and p.get("sample_outputs")],
        key=lambda p: p["fitness"].get("avg_score", 0),
        reverse=True,
    )[:top_n]
    outputs: list[str] = []
    for p in scored:
        for out in p["sample_outputs"].values():
            if out and out not in outputs:
                outputs.append(out)
    return outputs[:3]


# ── Drift guard ────────────────────────────────────────────────────────────

def _theme_keywords(theme: str) -> set[str]:
    words = re.findall(r"[a-zA-Zа-яА-ЯёЁ]{4,}", theme.lower())
    stop = {
        "что", "как", "это", "или", "для", "под", "напиши", "пост", "write",
        "about", "what", "which", "with", "that", "this", "from",
    }
    return {w for w in words if w not in stop}


def _drift_check(theme: str, new_prompt: str) -> bool:
    """At least one content keyword from the theme must appear in the new prompt."""
    keywords = _theme_keywords(theme)
    if not keywords:
        return True
    return any(k in new_prompt.lower() for k in keywords)


# ── Operator registry ──────────────────────────────────────────────────────

ALL_OPERATORS = [
    "zero_order", "first_order", "hyper", "lamarckian",
    "eda", "eda_rank_index", "lineage_based", "crossover", "workbook",
]

DEFAULT_OPERATORS = ALL_OPERATORS[:]


def apply_operator(
    op: str,
    parent: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
    lineage: Optional[dict] = None,
) -> Optional[MutationResult]:
    """
    Dispatcher. Returns a MutationResult (text + provenance), or None on failure.
    Operators that need population context receive `lineage`.
    """
    prompts: list[dict] = lineage["prompts"] if lineage else [parent]
    pf = parent.get("fitness", {})   # parent fitness (may be empty)

    if op == "zero_order":
        result = op_zero_order(theme_label, ask, rng)

    elif op == "first_order":
        result = op_first_order(parent["text"], pf, theme_label, ask, rng)

    elif op == "hyper":
        result = op_hyper(parent["text"], pf, theme_label, ask, rng)

    elif op == "lamarckian":
        outputs = parent.get("sample_outputs", {})
        if not outputs:
            result = op_first_order(parent["text"], pf, theme_label, ask, rng)
        else:
            best = max(outputs.values(), key=len)
            result = op_lamarckian(parent["text"], pf, theme_label, best, ask, rng)

    elif op == "eda":
        result = op_eda(theme_label, prompts, ask, rng)

    elif op == "eda_rank_index":
        result = op_eda_rank_index(theme_label, prompts, ask, rng)

    elif op == "lineage_based":
        ancestors = _get_ancestor_texts(parent, prompts)
        result = op_lineage_based(parent["text"], pf, theme_label, ancestors, ask, rng)

    elif op == "crossover":
        others = [p for p in prompts if p["id"] != parent["id"]]
        if others:
            second = rng.choice(others)
            result = op_crossover(
                parent["text"], second["text"],
                pf, second.get("fitness", {}),
                theme_label, ask, rng,
            )
        else:
            result = op_first_order(parent["text"], pf, theme_label, ask, rng)

    elif op == "workbook":
        good = _get_good_outputs(prompts)
        result = op_workbook(parent["text"], pf, theme_label, good, ask, rng)

    else:
        raise ValueError(f"Unknown operator: {op!r}")

    # Drift guard — discard mutations that wandered off-topic
    if result and not _drift_check(theme_label, result.text):
        return None
    return result
