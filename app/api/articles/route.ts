import { loadArticles } from "@/lib/articles"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const articles = loadArticles().map((a) => ({
    id: a.id,
    topic: a.topic,
    published_at: a.published_at,
    author_style: a.author_style,
    roles: a.roles,
  }))
  return NextResponse.json(articles)
}
