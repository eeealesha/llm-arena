import { loadTournaments } from "@/lib/data"
import { loadArticles } from "@/lib/articles"
import type { MetadataRoute } from "next"

const BASE = "https://onlyanalyst.ru"

export const dynamic = "force-dynamic"

export default function sitemap(): MetadataRoute.Sitemap {
  const tournaments = loadTournaments()
  const articles    = loadArticles()

  return [
    { url: BASE, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/tournaments`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/blog`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/stats`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/compare`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${BASE}/team`, changeFrequency: "monthly", priority: 0.5 },
    ...tournaments.map((t) => ({
      url: `${BASE}/tournament/${t.id}`,
      lastModified: new Date(t.run_at),
      changeFrequency: "never" as const,
      priority: 0.7,
    })),
    ...articles.map((a) => ({
      url: `${BASE}/blog/${a.id}`,
      lastModified: new Date(a.published_at),
      changeFrequency: "never" as const,
      priority: 0.8,
    })),
  ]
}
