import { notFound } from "next/navigation"
import { getArticle, ROLE_LABELS } from "@/lib/articles"
import ShareButton from "@/components/share-button"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Metadata } from "next"

const SITE_URL = "https://onlyanalyst.ru"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = getArticle(params.slug)
  if (!article) return {}
  const desc = article.final_text.replace(/[#>*_`\-]{1,3}/g, "").slice(0, 160).trim()
  const author = (article.roles?.author ?? "").split(":")[0].split("/").pop() ?? ""
  const ogUrl = `/api/og?kind=article&title=${encodeURIComponent(article.topic)}&subtitle=${encodeURIComponent(`${article.author_style === "storyteller" ? "✍️ Сторителлер" : "🔬 Аналитик"} · ${author}`)}`
  return {
    title: article.topic,
    description: desc,
    openGraph: {
      title: article.topic,
      description: desc,
      type: "article",
      publishedTime: article.published_at,
      images: [ogUrl],
    },
    twitter: { card: "summary_large_image", images: [ogUrl] },
  }
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = getArticle(params.slug)
  if (!article) notFound()

  const date = new Date(article.published_at).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const authorRole = article.author_style === "storyteller" ? "storyteller" : "analyst"
  const authorLabel = ROLE_LABELS[authorRole]

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="badge bg-indigo-600/20 text-indigo-300">
            {authorLabel.icon} {authorLabel.ru}
          </span>
          <span className="badge bg-emerald-900/30 text-emerald-400">
            ✓ Проверено Алексеем Гавриловым
          </span>
          <span className="text-gray-500 text-sm">{date}</span>
          <ShareButton
            title={article.topic}
            text={`${article.topic} — статья от редакции LLM`}
            path={`/blog/${article.id}`}
            className="ml-auto"
          />
        </div>
        <h1 className="text-2xl font-bold text-white leading-snug">{article.topic}</h1>
      </div>

      {/* Byline */}
      <div className="card border-[#2a2d3e] bg-[#1a1d27]">
        <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Редакционная команда</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <BylineCard
            icon={ROLE_LABELS.planner.icon}
            role={ROLE_LABELS.planner.ru}
            model={article.roles.planner}
          />
          <BylineCard
            icon={authorLabel.icon}
            role={authorLabel.ru}
            model={article.roles.author}
          />
          <BylineCard
            icon={ROLE_LABELS.editor.icon}
            role={ROLE_LABELS.editor.ru}
            model={article.roles.editor}
          />
          <BylineCard
            icon={ROLE_LABELS.chief_editor.icon}
            role={ROLE_LABELS.chief_editor.ru}
            model={article.roles.chief_editor}
          />
        </div>
        <div className="mt-4 pt-3 border-t border-[#2a2d3e] flex items-center gap-2 text-sm text-gray-400">
          <span className="text-emerald-400 font-medium">✓</span>
          Проверено и одобрено{" "}
          <span className="text-white font-medium">Алексеем Гавриловым</span>
        </div>
      </div>

      {/* Article text */}
      <article className="card">
        <div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:scroll-mt-24 prose-pre:bg-[#0a0c12] prose-pre:border prose-pre:border-[#2a2d3e] prose-code:before:hidden prose-code:after:hidden">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {stripDuplicateTitle(article.final_text, article.topic)}
          </ReactMarkdown>
        </div>
      </article>

      {/* JSON-LD structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": article.topic,
            "datePublished": article.published_at,
            "dateModified": article.published_at,
            "inLanguage": "ru-RU",
            "author": [
              { "@type": "Person", "name": "Алексей Гаврилов" },
              ...Object.values(article.roles).map((m) => ({
                "@type": "SoftwareApplication",
                "name": m,
                "applicationCategory": "LargeLanguageModel",
              })),
            ],
            "publisher": {
              "@type": "Organization",
              "name": "LLM Arena",
              "url": SITE_URL,
            },
            "mainEntityOfPage": { "@type": "WebPage", "@id": `${SITE_URL}/blog/${article.id}` },
            "url": `${SITE_URL}/blog/${article.id}`,
            "description": article.final_text.replace(/[#>*_`\-]{1,3}/g, "").slice(0, 280).trim(),
          }),
        }}
      />

      {/* History (collapsible) */}
      {article.history.length > 1 && (
        <details className="card border-[#2a2d3e]">
          <summary className="cursor-pointer text-gray-400 text-sm font-medium hover:text-gray-200 transition-colors">
            История редактуры ({article.history.length} версий)
          </summary>
          <div className="mt-4 space-y-4">
            {article.history.map((h, i) => {
              const label = historyLabel(h.role)
              return (
                <div key={i} className="border-l-2 border-[#2a2d3e] pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge bg-[#2a2d3e] text-gray-300 text-xs">{label}</span>
                    <span className="text-gray-500 text-xs">{shortModel(h.model)}</span>
                  </div>
                  <p className="text-gray-400 text-sm leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {h.text.slice(0, 400)}{h.text.length > 400 ? "…" : ""}
                  </p>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}

function BylineCard({ icon, role, model }: { icon: string; role: string; model: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-xs text-gray-500 mb-0.5">{role}</div>
      <div className="text-xs text-gray-300 font-medium truncate" title={model}>
        {shortModel(model)}
      </div>
    </div>
  )
}

function shortModel(name: string) {
  return name.split(":")[0].split("/").pop() ?? name
}

// LLM authors often duplicate the topic as the first H1.
// If the first non-empty line is a heading roughly matching the topic, drop it.
function stripDuplicateTitle(text: string, topic: string): string {
  const lines = text.split("\n")
  let i = 0
  while (i < lines.length && !lines[i].trim()) i++
  if (i >= lines.length) return text
  const first = lines[i].trim()
  if (/^#{1,3}\s/.test(first)) {
    const heading = first.replace(/^#{1,3}\s+/, "").replace(/\*+/g, "").trim().toLowerCase()
    const tp = topic.toLowerCase()
    if (heading === tp || heading.includes(tp) || tp.includes(heading.slice(0, 20))) {
      return lines.slice(i + 1).join("\n").trimStart()
    }
  }
  return text
}

function historyLabel(role: string) {
  const map: Record<string, string> = {
    planner: "📋 План",
    author_draft: "✍️ Черновик",
    chief_editor: "👑 Выпускающий",
  }
  if (role in map) return map[role]
  if (role.startsWith("editor_v")) return `✅ Редактура v${role.slice(-1)}`
  if (role.startsWith("author_v")) return `✍️ Доработка v${role.slice(-1)}`
  return role
}
