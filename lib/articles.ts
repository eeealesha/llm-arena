import fs from "fs"
import path from "path"

export interface ArticleRole {
  planner: string
  author: string
  editor: string
  chief_editor: string
}

export interface ArticleHistoryEntry {
  role: string
  model: string
  text: string
}

export interface Article {
  id: string
  topic: string
  author_style: "storyteller" | "analyst"
  published_at: string
  verified_by: string
  roles: ArticleRole
  final_text: string
  history: ArticleHistoryEntry[]
}

const ARTICLES_DIR = path.join(process.cwd(), "public", "data", "articles")

export function loadArticles(): Article[] {
  if (!fs.existsSync(ARTICLES_DIR)) return []
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, f), "utf-8")) as Article)
}

export function getArticle(id: string): Article | null {
  const file = path.join(ARTICLES_DIR, `${id}.json`)
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, "utf-8")) as Article
}

export function articleSlug(id: string) {
  return id
}

export const ROLE_LABELS: Record<string, { ru: string; icon: string; desc: string }> = {
  planner: {
    ru: "Планёр",
    icon: "📋",
    desc: "Разрабатывает структуру и тезисы статьи. Самая высокая оригинальность по замерам.",
  },
  storyteller: {
    ru: "Автор-сторителлер",
    icon: "✍️",
    desc: "Пишет живые, захватывающие тексты. Наивысший engagement + originality.",
  },
  analyst: {
    ru: "Автор-аналитик",
    icon: "🔬",
    desc: "Создаёт аналитические материалы с фактами и данными. Наивысший informativeness + accuracy.",
  },
  editor: {
    ru: "Редактор",
    icon: "✅",
    desc: "Проверяет факты, исправляет ошибки, улучшает структуру. Наивысшая точность по замерам.",
  },
  chief_editor: {
    ru: "Выпускающий редактор",
    icon: "👑",
    desc: "Делает финальную правку и отвечает за публикацию. Победитель турнира по TrueSkill.",
  },
}
