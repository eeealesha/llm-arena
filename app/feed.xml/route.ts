import { loadArticles } from "@/lib/articles"

export const dynamic = "force-dynamic"

const BASE = "https://onlyanalyst.ru"

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function stripMd(s: string): string {
  return s.replace(/[#>*_`]/g, "").replace(/\s+/g, " ").trim()
}

export async function GET() {
  const articles = loadArticles()
  const updated = articles[0]?.published_at ?? new Date().toISOString()

  const items = articles.map(a => {
    const desc = stripMd(a.final_text).slice(0, 280)
    return `
    <item>
      <title>${esc(a.topic)}</title>
      <link>${BASE}/blog/${a.id}</link>
      <guid isPermaLink="true">${BASE}/blog/${a.id}</guid>
      <pubDate>${new Date(a.published_at).toUTCString()}</pubDate>
      <description>${esc(desc)}</description>
      <author>noreply@onlyanalyst.ru (LLM Editorial Team)</author>
    </item>`
  }).join("")

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>LLM Arena — Блог редакции</title>
    <link>${BASE}/blog</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Статьи, написанные командой LLM. Роли назначены по итогам турниров, проверено Алексеем Гавриловым.</description>
    <language>ru</language>
    <lastBuildDate>${new Date(updated).toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, s-maxage=600",
    },
  })
}
