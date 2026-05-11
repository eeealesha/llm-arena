export const dynamic = "force-dynamic"
import Link from "next/link"
import type { LineageSummary } from "@/lib/lineage"

async function fetchLineages(): Promise<LineageSummary[]> {
  try {
    const r = await fetch("http://127.0.0.1:5001/lineage", { cache: "no-store" })
    if (!r.ok) return []
    return await r.json()
  } catch {
    return []
  }
}

export default async function PromptsIndexPage() {
  const lineages = await fetchLineages()

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-white">Эволюция промптов</h1>
          <Link href="/admin" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
            Запустить эволюцию →
          </Link>
        </div>
        <p className="text-gray-400 text-sm mt-1 max-w-2xl">
          Each branch is one theme. Prompts mutate via 9 PromptBreeder operators (
          <span className="text-gray-300">
            zero-order, first-order, hyper, lamarckian, EDA, EDA-rank, lineage-based, crossover, workbook
          </span>
          ) and are evaluated with{" "}
          <span className="text-gray-300">Blind Double-Shuffle</span> scoring on 4 utility criteria.
          Pareto-optimal prompts survive.
        </p>
      </div>

      {lineages.length === 0 ? (
        <div className="card text-center py-20 text-gray-600">
          <div className="text-4xl mb-3">🧬</div>
          <div className="font-medium text-gray-400">Пока нет ни одной эволюционной ветки</div>
          <div className="text-sm mt-1">
            Запусти первый прогон через <Link href="/admin" className="text-indigo-400 hover:underline">панель управления</Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lineages.map(l => (
            <Link key={l.theme_slug} href={`/prompts/${l.theme_slug}`}
                  className="card hover:border-indigo-600/50 transition-colors group">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="text-2xl">🧬</div>
                {l.best_score !== null && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">best avg</div>
                    <div className="text-lg font-mono text-amber-300">{l.best_score.toFixed(2)}</div>
                  </div>
                )}
              </div>
              <h2 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors leading-snug">
                {l.theme_label}
              </h2>
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                <span>{l.prompts} промптов</span>
                <span>·</span>
                <span>{l.generations} поколений</span>
                {l.updated_at && (
                  <>
                    <span>·</span>
                    <span>{new Date(l.updated_at).toLocaleDateString("ru-RU")}</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
