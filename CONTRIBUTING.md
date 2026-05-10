# Как мы работаем

## Доска задач

[**LLM Arena Roadmap**](https://github.com/users/eeealesha/projects/1) — единственный источник правды по тому, что в работе.

- **Backlog** → новые идеи, не разобранные
- **Ready** → задача декомпозирована, эстимейт ясен
- **In Progress** → активно делается (один issue на исполнителя)
- **In Review** → PR открыт
- **Done** → merge в main

## Лейблы

**Тип:** `bug` · `feature` · `security` · `infra`
**Область:** `seo` · `perf` · `ux` · `content` · `monetization`
**Приоритет:** `P0` (срочно) · `P1` (высокий) · `P2` (средний) · `P3` (nice-to-have)
**Скоуп:** `quick-win` (до 2 часов)

## Правила работы с issues

### 1. Каждая задача = issue

Если идея не на доске — её не существует. Я (Claude) создаю issue при первом упоминании
проблемы или фичи в чате. У каждого тикета:
- Тип + приоритет + область (лейблы)
- Acceptance criteria
- Ссылка на файл/строку, если фикс

### 2. Каждый коммит закрывает issue

Формат сообщения:
```
<глагол> <короткое описание>

<тело: почему это нужно, что изменилось>

Closes #N
```

Слова `Closes`, `Fixes`, `Resolves` + `#N` авто-закрывают issue при merge в main.

### 3. Большие задачи декомпозируются

Эпик — отдельный issue с чек-листом подзадач:
```markdown
- [ ] #41 Создать схему БД
- [ ] #42 Миграция JSON → SQL
- [ ] #43 Обновить loadTournaments
```
Каждая подзадача — свой issue. Закрытие подзадачи отмечает чекбокс в эпике.

### 4. Перед началом работы

```bash
# Берём задачу
gh issue develop 42 --checkout   # создаёт ветку issue-42-...
# или
git checkout -b fix/admin-auth
```

### 5. Перед коммитом

```bash
gh issue view 42   # вспомнить acceptance
git commit -m "Add Basic Auth to /admin

ADMIN_PASS env var, middleware.ts checks Authorization header on
every /admin and /api/runner request.

Closes #1"
```

## Полезные команды

```bash
# Авторизация (один раз)
cat ~/.claude/secrets/llm-arena-gh-token | gh auth login --with-token

# Что взять в работу сейчас
gh issue list --label P0 --state open
gh issue list --label "P1,quick-win" --state open

# Что я сделал на этой неделе
gh issue list --state closed --search "closed:>$(date -v-7d +%Y-%m-%d)"

# Создать issue из ходу
gh issue create --title "..." --label "bug,P1" --body "..."

# Привязать issue к проекту
gh project item-add 1 --owner eeealesha --url <issue-url>
```

## Что НЕ кладём в issue

- Дискуссии без actionable пункта → в чат
- Идеи "может когда-нибудь" → в `BACKLOG.md` без issue (фильтр шума)
- Секреты, токены, пароли → никогда
