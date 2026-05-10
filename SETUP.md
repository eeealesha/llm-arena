# LLM Arena — Setup

## Требования
Node.js 18+ (проверь: `node --version`)

Если старее — установи: `brew install node@20 && brew link node@20`

## Запуск

```bash
cd tournament-site
npm install
npm run dev
# → http://localhost:3000
```

## Добавить новый турнир

Скопируй JSON файл из `llm_challange/` в `tournament-site/data/tournaments/`:
```bash
cp ../tournament_iter2_*.json data/tournaments/
```
Сайт подхватит автоматически при перезапуске (или hot-reload в dev).

## Supabase — голоса пользователей (опционально)

1. Создай проект на https://supabase.com (бесплатно)
2. Выполни в SQL Editor:

```sql
create table votes (
  id uuid primary key default gen_random_uuid(),
  tournament_id text not null,
  post_a_model text not null,
  post_b_model text not null,
  winner text not null check (winner in ('A', 'B', 'SKIP')),
  voter_fingerprint text,
  created_at timestamptz default now()
);
create index on votes (post_a_model);
create index on votes (post_b_model);
```

3. Скопируй `.env.local.example` → `.env.local` и вставь URL + Service Role Key
4. Перезапусти `npm run dev`

Без Supabase голоса работают через localStorage (только в браузере пользователя).

## Деплой на Vercel

```bash
npx vercel
```
Добавь env vars в дашборде Vercel: `NEXT_PUBLIC_SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`.
