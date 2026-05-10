import { loadTournaments, aggregateLeaderboard, modelSlug } from "@/lib/data"
import { loadArticles } from "@/lib/articles"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export interface SearchEntry {
  kind: "tournament" | "article" | "model"
  title: string
  subtitle?: string
  href: string
}

export async function GET() {
  const tournaments = loadTournaments()
  const articles    = loadArticles()
  const leaderboard = aggregateLeaderboard(tournaments)

  const entries: SearchEntry[] = []

  for (const t of tournaments) {
    const winner = t.ranking[0]?.model
    entries.push({
      kind: "tournament",
      title: t.task.trim().slice(0, 100) || `Турнир ${t.id.slice(-10)}`,
      subtitle: `${new Date(t.run_at).toLocaleDateString("ru-RU")} · ${winner ? "🥇 " + winner.split(":")[0] : ""}`,
      href: `/tournament/${t.id}`,
    })
  }
  for (const a of articles) {
    entries.push({
      kind: "article",
      title: a.topic,
      subtitle: `${new Date(a.published_at).toLocaleDateString("ru-RU")} · ${a.author_style === "storyteller" ? "✍️" : "🔬"} ${a.roles?.author?.split(":")[0] ?? ""}`,
      href: `/blog/${a.id}`,
    })
  }
  for (const m of leaderboard) {
    entries.push({
      kind: "model",
      title: m.model,
      subtitle: `${m.tournaments} турниров · ср. ранг ${m.avg_rank.toFixed(1)}`,
      href: `/model/${modelSlug(m.model)}`,
    })
  }

  return NextResponse.json(entries)
}
