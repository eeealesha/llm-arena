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
import re
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


_THEME_ANCHOR = (
    "ВАЖНО: исходная тема поста — «{theme}». "
    "Новая инструкция ДОЛЖНА сохранить эту тему. "
    "Мутация меняет ТОЛЬКО структуру, формат, стиль или фокус инструкции — "
    "НИКОГДА не меняй предметную область."
)


def op_first_order(
    parent_text: str,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Standard mutation: rephrase / improve the parent prompt within the theme."""
    mut = rng.choice(SEED_MUTATION_PROMPTS)
    sys = (
        "Ты — эксперт по prompt engineering. Тебе дадут тему, инструкцию и операцию мутации. "
        "Примени операцию и верни новую версию инструкции. "
        "Ответь ТОЛЬКО самой инструкцией, 2-4 предложения, без объяснений.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"ТЕМА: {theme_label}\n\nИНСТРУКЦИЯ:\n{parent_text}\n\nОПЕРАЦИЯ:\n{mut}"
    reply = ask(user, sys)
    return _clean(reply) if reply else None


def op_hyper(
    parent_text: str,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Self-referential: invent a new META-mutation, then apply it to the parent.

    Critical: the invented operation must only touch structure/style/format —
    never the topic itself. We constrain this in both steps explicitly.
    """
    # Step 1: invent a new mutation operation — constrained to meta-changes only
    meta = rng.choice(SEED_MUTATION_PROMPTS)
    sys1 = (
        "Ты — эксперт по эволюционным алгоритмам и prompt engineering. "
        "Тебе дадут пример операции мутации промптов. Придумай НОВУЮ операцию.\n\n"
        "СТРОГОЕ ОГРАНИЧЕНИЕ: операция должна менять ТОЛЬКО структуру, формат, тон, "
        "длину или стиль изложения инструкции. Она НИКОГДА не должна менять предметную "
        "область (тему). Запрещены операции вида «замени тему», «используй пример из X», "
        "«перенеси на другую область».\n\n"
        "Ответь одним предложением — самой операцией."
    )
    new_mut = ask(meta, sys1)
    if not new_mut:
        return None
    new_mut = _clean(new_mut)

    # Step 2: apply the freshly-invented operation to the parent — with theme anchor
    sys2 = (
        "Ты — эксперт по prompt engineering. Примени операцию мутации к инструкции. "
        "Верни ТОЛЬКО новую инструкцию, 2-4 предложения, без преамбулы.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = f"ТЕМА: {theme_label}\n\nИНСТРУКЦИЯ:\n{parent_text}\n\nОПЕРАЦИЯ:\n{new_mut}"
    reply = ask(user, sys2)
    if not reply:
        return None
    return _clean(reply)


def op_lamarckian(
    parent_text: str,
    theme_label: str,
    successful_output: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """
    Reverse-engineer a prompt from a successful post. The prompt should be
    generic enough to work for the theme, not just for this specific output.
    """
    sys = (
        "Ты — эксперт по prompt engineering. Тебе дадут тему и пример отличного поста. "
        "Сформулируй инструкцию, которая идеально привела бы к такому посту НА ЛЮБОМ "
        "примере по этой теме. Инструкция должна быть универсальной, а не пересказывать "
        "конкретный пост.\n\n"
        "Ответь ТОЛЬКО инструкцией, 2-4 предложения, без преамбулы.\n\n"
        + _THEME_ANCHOR.format(theme=theme_label)
    )
    user = (
        f"ТЕМА: {theme_label}\n\n"
        f"ИСХОДНАЯ ИНСТРУКЦИЯ:\n{parent_text}\n\n"
        f"УСПЕШНЫЙ ПОСТ (написан по этой инструкции):\n{successful_output[:1500]}\n\n"
        "Какая инструкция привела бы к такому результату? Сделай её сильнее исходной."
    )
    reply = ask(user, sys)
    return _clean(reply) if reply else None


# ── Operator registry ─────────────────────────────────────────────────────
ALL_OPERATORS = ["zero_order", "first_order", "hyper", "lamarckian"]


def _theme_keywords(theme: str) -> set:
    """Extract content keywords (longer than 3 chars) from theme for drift check."""
    words = re.findall(r"[a-zA-Zа-яА-ЯёЁ]{4,}", theme.lower())
    # Filter common stop-words (Russian + minimal English)
    stop = {"что", "как", "это", "или", "для", "под", "ситуации", "напиши", "пост",
            "writing", "about", "what", "which"}
    return {w for w in words if w not in stop}


def _drift_check(theme: str, new_prompt: str) -> bool:
    """
    Lightweight diversity guard: at least one content keyword from the theme
    must appear in the new prompt. If theme has no extractable keywords,
    skip the check (return True).
    """
    keywords = _theme_keywords(theme)
    if not keywords:
        return True
    return any(k in new_prompt.lower() for k in keywords)


def apply_operator(
    op: str,
    parent: dict,
    theme_label: str,
    ask: Callable[[str, str], Optional[str]],
    rng: random.Random,
) -> Optional[str]:
    """Dispatcher. Returns the mutated prompt text, or None on failure."""
    if op == "zero_order":
        result = op_zero_order(theme_label, ask, rng)
    elif op == "first_order":
        result = op_first_order(parent["text"], theme_label, ask, rng)
    elif op == "hyper":
        result = op_hyper(parent["text"], theme_label, ask, rng)
    elif op == "lamarckian":
        outputs = parent.get("sample_outputs", {})
        if not outputs:
            result = op_first_order(parent["text"], theme_label, ask, rng)  # fallback
        else:
            best_output = max(outputs.values(), key=len)
            result = op_lamarckian(parent["text"], theme_label, best_output, ask, rng)
    else:
        raise ValueError(f"Unknown operator: {op}")

    # Drift guard — discard mutations that wandered off-theme
    if result and not _drift_check(theme_label, result):
        return None
    return result
