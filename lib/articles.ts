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

// Map from slug → original filename (without .json)
function buildSlugMap(): Map<string, string> {
  const map = new Map<string, string>()
  if (!fs.existsSync(ARTICLES_DIR)) return map
  for (const f of fs.readdirSync(ARTICLES_DIR)) {
    if (!f.endsWith(".json")) continue
    const name = f.replace(".json", "")
    map.set(toSlug(name), name)  // ascii slug → original name
    map.set(name, name)           // raw name → itself
  }
  return map
}

// Convert any string to a URL-safe ASCII slug
export function toSlug(s: string): string {
  return encodeURIComponent(s).replace(/%../g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
}

export function loadArticles(): Article[] {
  if (!fs.existsSync(ARTICLES_DIR)) return []
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => {
      const article = JSON.parse(fs.readFileSync(path.join(ARTICLES_DIR, f), "utf-8")) as Article
      // Normalise id to ASCII slug so URL routing works regardless of Cyrillic filenames
      article.id = toSlug(f.replace(".json", ""))
      return article
    })
}

export function getArticle(slug: string): Article | null {
  const slugMap = buildSlugMap()
  // Try: decoded slug, raw slug, URL-decoded incoming slug
  const decoded = (() => { try { return decodeURIComponent(slug) } catch { return slug } })()
  const name = slugMap.get(decoded) ?? slugMap.get(slug) ?? slugMap.get(toSlug(decoded))
  if (!name) return null
  const file = path.join(ARTICLES_DIR, `${name}.json`)
  if (!fs.existsSync(file)) return null
  const article = JSON.parse(fs.readFileSync(file, "utf-8")) as Article
  article.id = toSlug(name)
  return article
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
