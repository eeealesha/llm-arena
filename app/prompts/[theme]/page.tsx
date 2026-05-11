export const dynamic = "force-dynamic"
import { notFound } from "next/navigation"
import Link from "next/link"
import LineageTree from "@/components/lineage-tree"
import DeleteLineageButton from "@/components/delete-lineage-button"
import type { Lineage } from "@/lib/lineage"

async function fetchLineage(slug: string): Promise<Lineage | null> {
  try {
    const r = await fetch(`http://127.0.0.1:5001/lineage/${encodeURIComponent(slug)}`, { cache: "no-store" })
    if (r.status === 404) return null
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export default async function LineagePage({ params }: { params: { theme: string } }) {
  const lineage = await fetchLineage(params.theme)
  if (!lineage) notFound()

  const scored = lineage.prompts.filter(p => p.fitness?.n_evals)
  const best   = scored.sort((a, b) => b.fitness.avg_score - a.fitness.avg_score)[0]
  const pareto = lineage.prompts.filter(p => p.is_pareto)
  const totalEvals = scored.reduce((s, p) => s + p.fitness.n_evals, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link href="/prompts" className="hover:text-gray-300 transition-colors">Эволюция</Link>
        <span>/</span>
        <span className="text-gray-400 font-mono">{lineage.theme_slug}</span>
      </div>

      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-white leading-snug">{lineage.theme_label}</h1>
          <DeleteLineageButton slug={lineage.theme_slug} label={lineage.theme_label} />
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <Stat label="Промптов" value={lineage.prompts.length} />
          <Stat label="Поколений" value={lineage.generations.length} />
          <Stat label="Pareto-best" value={pareto.length} accent="amber" />
          <Stat label="Eval-ов" value={totalEvals} />
          {best && (
            <Stat label="Лучший avg" value={best.fitness.avg_score.toFixed(2)} accent="indigo" />
          )}
        </div>
      </div>

      <LineageTree lineage={lineage} />

      <div className="card border-[#2a2d3e]">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Как читать</div>
        <ul className="text-sm text-gray-400 space-y-1 leading-relaxed">
          <li>• <span className="text-gray-300">Карточка</span> — один промпт-кандидат. ID, оператор, краткий текст, fitness-бар.</li>
          <li>• <span className="text-amber-300">★ Pareto</span> — недоминируемые кандидаты (лучшие хотя бы по одному критерию).</li>
          <li>• <span className="text-gray-300">Стрелка</span> — мутация: цвет = оператор, лейбл показывает тип.</li>
          <li>• <span className="text-gray-300">gen N</span> — поколение. Чем ниже на полотне, тем позже.</li>
          <li>• <span className="text-gray-300">Клик на карточку</span> — открывает детали: текст, fitness по критериям, образцы постов, feedback судьи.</li>
        </ul>
      </div>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "amber" | "indigo" }) {
  const c = accent === "amber" ? "text-amber-300" : accent === "indigo" ? "text-indigo-300" : "text-gray-200"
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${c}`}>{value}</div>
    </div>
  )
}
