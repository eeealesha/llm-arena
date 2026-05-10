export const dynamic = "force-dynamic"
import Link from "next/link"
import { loadArticles, ROLE_LABELS } from "@/lib/articles"

export default function BlogPage() {
  const articles = loadArticles()

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Блог</h1>
          <p className="text-gray-400 text-sm mt-1">
            Статьи написаны командой языковых моделей — каждой назначена роль по итогам турнира.
            Проверено{" "}
            <span className="text-indigo-300 font-medium">Алексеем Гавриловым</span>.
          </p>
        </div>
        <a
          href="/feed.xml"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-amber-700/40 bg-amber-950/20 text-amber-300 hover:bg-amber-950/40 transition-colors shrink-0"
        >
          📡 RSS
        </a>
      </div>

      {articles.length === 0 ? (
        <div className="card text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">📝</div>
          <div className="font-medium text-gray-400">Статей пока нет</div>
          <div className="text-sm mt-1">
            Запусти <code className="text-indigo-400">write_blog_article()</code> в ноутбуке
          </div>
        </div>
      ) : (
        <div className="grid gap-5">
          {articles.map((a) => {
            const date = new Date(a.published_at).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
            const authorRole = a.author_style === "storyteller" ? "storyteller" : "analyst"
            const authorLabel = ROLE_LABELS[authorRole]
            const preview = a.final_text.slice(0, 220).trimEnd()

            return (
              <Link
                key={a.id}
                href={`/blog/${a.id}`}
                className="card group hover:border-indigo-600/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="badge bg-indigo-600/20 text-indigo-300">
                        {authorLabel.icon} {authorLabel.ru}
                      </span>
                      <span className="badge bg-emerald-900/30 text-emerald-400 flex items-center gap-1">
                        ✓ Проверено
                      </span>
                      <span className="text-gray-500 text-xs">{date}</span>
                    </div>
                    <h2 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors leading-snug">
                      {a.topic}
                    </h2>
                    <p className="text-gray-400 text-sm mt-2 leading-relaxed line-clamp-3">
                      {preview}
                      {a.final_text.length > 220 ? "…" : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-[#2a2d3e] flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                  <span>
                    {ROLE_LABELS.planner.icon} Планёр:{" "}
                    <span className="text-gray-400">{shortModel(a.roles.planner)}</span>
                  </span>
                  <span>
                    {authorLabel.icon} Автор:{" "}
                    <span className="text-gray-400">{shortModel(a.roles.author)}</span>
                  </span>
                  <span>
                    {ROLE_LABELS.editor.icon} Редактор:{" "}
                    <span className="text-gray-400">{shortModel(a.roles.editor)}</span>
                  </span>
                  <span>
                    {ROLE_LABELS.chief_editor.icon} Выпускающий:{" "}
                    <span className="text-gray-400">{shortModel(a.roles.chief_editor)}</span>
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function shortModel(name: string) {
  return name.split(":")[0].split("/").pop() ?? name
}
