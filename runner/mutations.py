"""
Prompt mutation operators.

Inspired by Promptbreeder (Fernando et al., 2023, arXiv:2309.16797) — implements
a subset of the 9 operators that's enough for a working evolution loop:

  zero_order   — generate a fresh prompt from the theme description alone
  first_order  — mutate one parent prompt using a mutation-prompt
  hyper        — mutate the mutation-prompt itself (self-referential)
  lamarckian   — reverse-engineer a prompt from a successful output

Each operator returns a string (the new prompt text). They call into an `ask`
callable supplied by the runner so they don't depend on HTTP details.
"""
from __future__ import annotations
import random
from typing import Callable, Optional


# ── Seed mutation prompts ─────────────────────────────────────────────────
SEED_MUTATION_PROMPTS = [
    "Перепиши эту инструкцию более конкретно, добавь требование привести цифры и примеры.",
    "Сделай инструкцию короче и резче, убери воду.",
    "Добавь требование к структуре: вопрос → разбор → вывод.",
    "Попроси автора начать с парадокса или удивительного факта.",
    "Усиль требование к фактической точности, добавь упоминание источников.",
    "Запроси конкретный жанр: storytelling с одним кейсом из жизни.",
    "Попроси сократить длину поста до 250 слов.",
    "Добавь критерий оригинальности: 'покажи угол, который никто не использует'.",
    "Запроси наличие чёткого CTA в конце.",
    "Перепиши инструкцию в формате чек-листа из 5 пунктов.",
]

# ── Thinking-style seeds (translated subset of Promptbreeder Appendix G) ──
SEED_THINKING_STYLES = [
    "Думай пошагово.",
    "Найди аналогии в смежных областях.",
    "Что упустит средний автор?",
    "Какие 3 типичные ошибки делают новички?",
    "Если бы это объяснял Андрей Карпатый — что бы он сказал?",
    "Какой вопрос важнее, чем сама задача?",
    "В чём контр-аргумент общепринятому ответу?",
    "Что осталось бы важным через 10 лет?",
    "Подойди к задаче от обратного: что НЕ нужно делать?",
    "Какой факт удивит даже эксперта?",
]


def _clean(s: str) -> str:
    """Strip common meta-prefixes that LLMs put before their answer."""
    s = s.strip().strip("«»\"' ")
    for prefix in (
        "Вот улучшенная задача:", "Улучшенная задача:", "Новая задача:",
        "Задача:", "Промпт:", "Инструкция:", "INSTRUCTION:", "INSTRUCTION MUTANT:",
        "Here's", "Here is", "Sure:", "Sure,",
    ):
        if s.startswith(prefix):
            s = s[len(prefix):].strip().strip("«»\"' ")
    # Drop leading numbering "1. " or "1) "
    if len(s) > 3 and s[0].isdigit() and s[1] in (".", ")"):
        s = s[2:].strip()
    return s


# ── Operators ─────────────────────────────────────────────────────────────
def op_zero_order(
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Generate a fresh prompt from theme description alone (no parent)."""
    style = rng.choice(SEED_THINKING_STYLES)
    sys = (
        "Ты — эксперт по prompt engineering. Сформулируй инструкцию для автора поста "
        "на заданную тему. Инструкция должна быть конкретной, 2-4 предложения. "
        "Ответь ТОЛЬКО самой инструкцией, без объяснений и преамбулы."
    )
    user = f"Тема поста: «{theme_label}»\n\nСтиль мышления при формулировке: «{style}»"
    reply = ask(user, sys)
    return _clean(reply) if reply else None


def op_first_order(
    parent_text: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Standard mutation: rephrase / improve the parent prompt."""
    mut = rng.choice(SEED_MUTATION_PROMPTS)
    sys = (
        "Ты — эксперт по prompt engineering. Тебе дадут инструкцию и операцию мутации. "
        "Примени операцию и верни новую версию инструкции. "
        "Ответь ТОЛЬКО самой инструкцией, 2-4 предложения, без объяснений."
    )
    user = f"ИНСТРУКЦИЯ:\n{parent_text}\n\nОПЕРАЦИЯ:\n{mut}"
    reply = ask(user, sys)
    return _clean(reply) if reply else None


def op_hyper(
    parent_text: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Self-referential: invent a new mutation-prompt, then apply it to the parent."""
    # Step 1: mutate the meta-prompt
    meta = rng.choice(SEED_MUTATION_PROMPTS)
    sys1 = (
        "Ты — эксперт по эволюционным алгоритмам и prompt engineering. "
        "Тебе дадут операцию мутации промптов. Придумай НОВУЮ операцию, более радикальную "
        "или более прицельную. Ответь одним предложением — самой операцией."
    )
    new_mut = ask(meta, sys1)
    if not new_mut:
        return None
    new_mut = _clean(new_mut)

    # Step 2: apply the freshly-mutated operation to the parent
    sys2 = (
        "Ты — эксперт по prompt engineering. Примени операцию мутации к инструкции. "
        "Верни ТОЛЬКО новую инструкцию, 2-4 предложения, без преамбулы."
    )
    user = f"ИНСТРУКЦИЯ:\n{parent_text}\n\nОПЕРАЦИЯ:\n{new_mut}"
    reply = ask(user, sys2)
    if not reply:
        return None
    text = _clean(reply)
    return text


def op_lamarckian(
    parent_text: str,
    successful_output: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Given a high-scoring post that was written using the parent prompt,
    reverse-engineer the IDEAL prompt that would have produced it.
    Encodes 'working knowledge' from outputs back into the prompt.
    """
    sys = (
        "Ты — эксперт по prompt engineering. Тебе дадут пример отличного поста. "
        "Сформулируй инструкцию, которая идеально привела бы к такому посту. "
        "Инструкция должна быть универсальной (не привязанной к конкретному содержанию). "
        "Ответь ТОЛЬКО инструкцией, 2-4 предложения, без преамбулы."
    )
    user = (
        f"ИСХОДНАЯ ИНСТРУКЦИЯ:\n{parent_text}\n\n"
        f"УСПЕШНЫЙ ПОСТ (написан по этой инструкции):\n{successful_output[:1500]}\n\n"
        "Какая инструкция привела бы к такому результату? Сделай её сильнее исходной."
    )
    reply = ask(user, sys)
    return _clean(reply) if reply else None


# ── Operator registry ─────────────────────────────────────────────────────
ALL_OPERATORS = ["zero_order", "first_order", "hyper", "lamarckian"]


def apply_operator(
    op: str,
    parent: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Dispatcher. Returns the mutated prompt text, or None on failure."""
    if op == "zero_order":
        return op_zero_order(theme_label, ask, rng)
    if op == "first_order":
        return op_first_order(parent["text"], ask, rng)
    if op == "hyper":
        return op_hyper(parent["text"], ask, rng)
    if op == "lamarckian":
        # Pick the best sample output from the parent (highest avg fitness model)
        outputs = parent.get("sample_outputs", {})
        if not outputs:
            return op_first_order(parent["text"], ask, rng)  # fallback
        # Just pick the longest output as a proxy for "best content"
        best_output = max(outputs.values(), key=len)
        return op_lamarckian(parent["text"], best_output, ask, rng)
    raise ValueError(f"Unknown operator: {op}")
