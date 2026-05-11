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

All operators accept an `ask(user, system) -> str | None` callable so they
remain HTTP-agnostic. The `apply_operator` dispatcher is the public API.
"""
from __future__ import annotations
import random
import re
from typing import Callable, Optional


# ── Seed mutation prompts (FOHM mutation-prompt pool) ─────────────────────
SEED_MUTATION_PROMPTS = [
    "Rewrite this instruction to be more concrete — require numbers and real examples.",
    "Make the instruction shorter and sharper; remove all filler.",
    "Add a required structure: question → analysis → conclusion.",
    "Ask the author to open with a paradox or surprising fact.",
    "Strengthen the accuracy requirement; ask for verifiable sources.",
    "Request a specific genre: one-case storytelling.",
    "Constrain the response to under 250 words.",
    "Add an originality criterion: 'show an angle nobody else uses'.",
    "Require a clear call-to-action at the end.",
    "Rewrite as a 5-point checklist.",
    "Demand that every claim be backed by a concrete example or number.",
    "Ask for the most counterintuitive implication of the topic.",
    "Require the author to steelman the opposite view before their conclusion.",
    "Add a constraint: no passive voice, no hedging phrases.",
    "Ask for a comparison between two competing approaches.",
]

# ── Thinking-style seeds (Appendix G of PromptBreeder paper) ──────────────
SEED_THINKING_STYLES = [
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
    # Drop leading numbering "1. " or "1) "
    if len(s) > 3 and s[0].isdigit() and s[1] in (".", ")"):
        s = s[2:].strip()
    return s


# ── Theme-anchor constraint (injected into every operator) ────────────────
_THEME_ANCHOR = (
    "IMPORTANT: the original topic is «{theme}». "
    "The new instruction MUST stay on this topic. "
    "Only change structure, format, style, focus, or constraints — "
    "NEVER change the subject matter."
)


# ── Operator implementations ───────────────────────────────────────────────

def op_zero_order(
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Zero-Order Hyper-Mutation (ZOHM seed variant, §3.1).
    Generate a fresh prompt from the theme description alone — no parent.
    Uses a randomly sampled thinking style as creative seed.
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
    return _clean(reply) if reply else None


def op_first_order(
    parent_text: str,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    First-Order Hyper-Mutation (FOHM, §3.1).
    Mutate the parent prompt using a randomly sampled mutation-prompt.
    """
    mut = rng.choice(SEED_MUTATION_PROMPTS)
    sys = (
        "You are a prompt engineering expert. Apply the given mutation operation to "
        "the instruction and return the improved version. "
        "Reply with ONLY the new instruction, 2–4 sentences, no preamble.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"TOPIC: {theme_label}\n\nINSTRUCTION:\n{parent_text}\n\nMUTATION:\n{mut}"
    reply = ask(user, sys)
    return _clean(reply) if reply else None


def op_hyper(
    parent_text: str,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Self-Referential Hyper-Mutation (§3.2).
    Step 1: invent a new mutation operation (constrained to meta-changes only).
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
    return _clean(reply) if reply else None


def op_lamarckian(
    parent_text: str,
    theme_label: str,
    successful_output: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Lamarckian Mutation (§3.3).
    Reverse-engineer a prompt from one high-scoring response.
    The resulting prompt must be generic, not a paraphrase of the example.
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
    return _clean(reply) if reply else None


def op_eda(
    theme_label: str,
    population: list[dict],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
    top_n: int = 5,
) -> Optional[str]:
    """
    Estimation of Distribution Mutation (EDA, §3.3).
    Sample patterns from the top-N scored prompts and synthesise a new one.
    Analogy: cross-entropy method over the prompt distribution.
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
    return _clean(reply) if reply else None


def op_eda_rank_index(
    theme_label: str,
    population: list[dict],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
    top_n: int = 5,
) -> Optional[str]:
    """
    EDA Rank-and-Index Mutation (§3.3).
    Like EDA but shows explicit rank + score, asking the LLM to reason about
    the delta between ranks and extrapolate.
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
    return _clean(reply) if reply else None


def op_lineage_based(
    parent_text: str,
    theme_label: str,
    ancestors: list[str],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Lineage-Based Mutation (§3.3).
    Expose the full ancestor chain to the LLM and ask it to extrapolate the
    next evolutionary step — like gradient estimation over discrete prompt space.
    """
    if not ancestors:
        return op_first_order(parent_text, theme_label, ask, rng)

    history = "\n".join(
        f"  gen {i}: {t}" for i, t in enumerate(ancestors[-6:])  # last 6 ancestors
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
    return _clean(reply) if reply else None


def op_crossover(
    parent_a: str,
    parent_b: str,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Prompt Crossover.
    Combine the strongest elements of two parent prompts into one offspring.
    Analogous to genetic crossover; exploits diversity in the population.
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
    return _clean(reply) if reply else None


def op_workbook(
    parent_text: str,
    theme_label: str,
    good_outputs: list[str],
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Workbook Mutation (multi-output Lamarckian, §3.3 extension).
    Reverse-engineer the ideal prompt from MULTIPLE high-scoring outputs,
    increasing signal by aggregating across examples.
    """
    if not good_outputs:
        return op_first_order(parent_text, theme_label, ask, rng)

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
    return _clean(reply) if reply else None


# ── Helpers for operators that need lineage context ────────────────────────

def _get_ancestor_texts(prompt: dict, all_prompts: list[dict]) -> list[str]:
    """Walk parent_id chain; return texts oldest → newest (excluding current)."""
    by_id = {p["id"]: p for p in all_prompts}
    chain: list[str] = []
    current = prompt
    seen = set()
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
    "zero_order",
    "first_order",
    "hyper",
    "lamarckian",
    "eda",
    "eda_rank_index",
    "lineage_based",
    "crossover",
    "workbook",
]

# Default set for the evolve CLI (excludes operators that require ≥2 prompts in lineage)
DEFAULT_OPERATORS = [
    "zero_order", "first_order", "hyper", "lamarckian",
    "eda", "eda_rank_index", "lineage_based", "crossover", "workbook",
]


def apply_operator(
    op: str,
    parent: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
    lineage: Optional[dict] = None,
) -> Optional[str]:
    """
    Dispatcher.  Returns mutated prompt text, or None on failure.
    Operators that need population context receive `lineage`.
    """
    prompts: list[dict] = lineage["prompts"] if lineage else [parent]

    if op == "zero_order":
        result = op_zero_order(theme_label, ask, rng)

    elif op == "first_order":
        result = op_first_order(parent["text"], theme_label, ask, rng)

    elif op == "hyper":
        result = op_hyper(parent["text"], theme_label, ask, rng)

    elif op == "lamarckian":
        outputs = parent.get("sample_outputs", {})
        if not outputs:
            result = op_first_order(parent["text"], theme_label, ask, rng)
        else:
            # pick the best output (by win_rate if available, else by length)
            best = max(outputs.values(), key=len)
            result = op_lamarckian(parent["text"], theme_label, best, ask, rng)

    elif op == "eda":
        result = op_eda(theme_label, prompts, ask, rng)

    elif op == "eda_rank_index":
        result = op_eda_rank_index(theme_label, prompts, ask, rng)

    elif op == "lineage_based":
        ancestors = _get_ancestor_texts(parent, prompts)
        result = op_lineage_based(parent["text"], theme_label, ancestors, ask, rng)

    elif op == "crossover":
        others = [p for p in prompts if p["id"] != parent["id"]]
        if others:
            second = rng.choice(others)
            result = op_crossover(parent["text"], second["text"], theme_label, ask, rng)
        else:
            result = op_first_order(parent["text"], theme_label, ask, rng)

    elif op == "workbook":
        good = _get_good_outputs(prompts)
        result = op_workbook(parent["text"], theme_label, good, ask, rng)

    else:
        raise ValueError(f"Unknown operator: {op!r}")

    # Drift guard — discard mutations that wandered off-topic
    if result and not _drift_check(theme_label, result):
        return None
    return result
