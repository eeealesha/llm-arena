export const dynamic = "force-dynamic"
import { notFound } from "next/navigation"
import Link from "next/link"
import LineageTree from "@/components/lineage-tree"
import DeleteLineageButton from "@/components/delete-lineage-button"
import type { Lineage } from "@/lib/lineage"
import { CRITERIA } from "@/lib/lineage"

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

const OPERATOR_DESCRIPTIONS: Record<string, { icon: string; short: string; long: string }> = {
  seed:          { icon: "🌱", short: "Начальный",       long: "Промпт, который вы задали. Стартовая точка для всех мутаций." },
  zero_order:    { icon: "🎲", short: "Нулевой порядок", long: "Генерирует новый промпт из темы — без родителя. Высокая вариативность, хорош для разведки." },
  first_order:   { icon: "✏️", short: "Первый порядок",  long: "Берёт родительский промпт и применяет случайную инструкцию перезаписи (например, «сделай короче», «добавь структуру»). Низкая вариативность." },
  hyper:         { icon: "🌀", short: "Гипер-мутация",   long: "Самоссылочный: сначала придумывает новую операцию мутации, затем применяет её. Может давать неожиданные результаты." },
  lamarckian:    { icon: "🧬", short: "Ламарковская",    long: "Реверс-инжиниринг идеального промпта через изучение лучшего сгенерированного ответа. Адаптируется к тому, что реально работает." },
  eda:           { icon: "📊", short: "EDA",             long: "Оценка распределения: синтезирует новый промпт, анализируя паттерны в топ-N лучших промптах популяции." },
  eda_rank_index:{ icon: "📈", short: "EDA-ранг",        long: "Как EDA, но показывает модели ранжированный список и просит сгенерировать промпт, который обойдёт #1." },
  lineage_based: { icon: "🌿", short: "Линейный",        long: "Показывает полную цепочку предков (gen 0 → gen N) и просит экстраполировать следующий эволюционный шаг." },
  crossover:     { icon: "✂️", short: "Кроссовер",       long: "Берёт два родительских промпта и комбинирует их лучшие элементы — как генетический кроссовер." },
  workbook:      { icon: "📓", short: "Рабочая книга",   long: "Использует несколько высококачественных ответов как примеры и реверс-инжинирит промпт, стабильно воспроизводящий их." },
}

export default async function LineagePage({ params }: { params: { theme: string } }) {
  const lineage = await fetchLineage(params.theme)
  if (!lineage) notFound()

  const scored = lineage.prompts.filter(p => p.fitness?.n_evals)
  const sortedByScore = [...scored].sort((a, b) => b.fitness.avg_score - a.fitness.avg_score)
  const best    = sortedByScore[0]
  const seed    = lineage.prompts.find(p => p.mutation_op === "seed" && p.generation === 0)
  const pareto  = lineage.prompts.filter(p => p.is_pareto)
  const totalEvals = scored.reduce((s, p) => s + p.fitness.n_evals, 0)

  // operators used in this lineage
  const opsUsed = [...new Set(lineage.prompts.map(p => p.mutation_op))]

  // score progression by generation
  const byGen: Record<number, number[]> = {}
  for (const p of scored) {
    if (!byGen[p.generation]) byGen[p.generation] = []
    byGen[p.generation].push(p.fitness.avg_score)
  }
  const genProgress = Object.entries(byGen)
    .map(([g, scores]) => ({
      gen: Number(g),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      best: Math.max(...scores),
    }))
    .sort((a, b) => a.gen - b.gen)

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link href="/prompts" className="hover:text-gray-300 transition-colors">Эволюция</Link>
        <span>/</span>
        <span className="text-gray-400 font-mono">{lineage.theme_slug}</span>
      </div>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-white leading-snug">{lineage.theme_label}</h1>
          <DeleteLineageButton slug={lineage.theme_slug} label={lineage.theme_label} />
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-sm">
          <Stat label="Промптов" value={lineage.prompts.length} />
          <Stat label="Поколений" value={lineage.generations.length} />
          <Stat label="Pareto-оптимальных" value={pareto.length} accent="amber" />
          <Stat label="Оценок" value={totalEvals} />
          {best && (
            <Stat label="Лучший avg" value={`${best.fitness.avg_score.toFixed(2)}/10`} accent="indigo" />
          )}
        </div>
      </div>

      {/* Score progression */}
      {genProgress.length > 1 && (
        <div className="card border-[#2a2d3e]">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Прогресс оценок по поколениям</div>
          <div className="space-y-2">
            {genProgress.map(gp => (
              <div key={gp.gen} className="flex items-center gap-3 text-xs">
                <span className="text-gray-600 w-12">ген {gp.gen}</span>
                <div className="flex-1 h-2 bg-[#2a2d3e] rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(gp.best / 10) * 100}%` }} />
                </div>
                <span className="text-gray-400 font-mono w-28 text-right">
                  лучший {gp.best.toFixed(2)} <span className="text-gray-600">/ avg {gp.avg.toFixed(2)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt comparison: seed vs best */}
      {seed && best && best.id !== seed.id && (
        <div className="card border-[#2a2d3e] space-y-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Начальный промпт → лучший эволюционировавший
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌱</span>
                <span className="text-sm font-medium text-gray-300">Ген 0 (начальный)</span>
                {seed.fitness?.avg_score != null && (
                  <span className="ml-auto text-xs font-mono text-gray-500">{seed.fitness.avg_score.toFixed(2)}/10</span>
                )}
              </div>
              <p className="text-sm text-gray-400 bg-[#0a0c12] border border-[#2a2d3e] rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                {seed.text}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{OPERATOR_DESCRIPTIONS[best.mutation_op]?.icon ?? "•"}</span>
                <span className="text-sm font-medium text-indigo-300">Лучший (ген {best.generation})</span>
                {best.fitness?.avg_score != null && (
                  <span className="ml-auto text-xs font-mono text-indigo-300 font-bold">{best.fitness.avg_score.toFixed(2)}/10</span>
                )}
              </div>
              <p className="text-sm text-gray-300 bg-indigo-950/10 border border-indigo-800/30 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">
                {best.text}
              </p>
            </div>
          </div>
          {/* Per-criteria delta */}
          {seed.fitness?.n_evals && best.fitness?.n_evals && (
            <div className="pt-3 border-t border-[#2a2d3e]">
              <div className="text-xs text-gray-600 mb-2">Изменение по критериям (начальный → лучший)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CRITERIA.map(c => {
                  const seedVal = (seed.fitness as unknown as Record<string, number>)[c] ?? 0
                  const bestVal = (best.fitness as unknown as Record<string, number>)[c] ?? 0
                  const delta   = bestVal - seedVal
                  return (
                    <div key={c} className="text-center">
                      <div className="text-[10px] text-gray-600 mb-1">{c.replace("_", " ")}</div>
                      <div className="text-xs text-gray-400">{seedVal.toFixed(1)} → <span className="text-indigo-300">{bestVal.toFixed(1)}</span></div>
                      <div className={`text-xs font-mono mt-0.5 ${delta > 0 ? "text-emerald-400" : delta < 0 ? "text-rose-400" : "text-gray-600"}`}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Genealogy tree */}
      <LineageTree lineage={lineage} />

      {/* Pareto explanation */}
      <div className="card border-[#2a2d3e]">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Что такое Pareto-оптимальный? ★</div>
        <p className="text-sm text-gray-400 leading-relaxed">
          Промпт является <span className="text-amber-300">Pareto-оптимальным</span>, если ни один другой промпт не превосходит его{" "}
          <em>одновременно по всем</em> критериям. Например: промпт A набирает больше по{" "}
          <em>density</em>, но меньше по <em>specificity</em>, чем промпт B — оба Pareto-оптимальны,
          потому что ни один полностью не доминирует над другим. Граница Парето даёт набор
          наилучших компромиссов, а не единственного победителя.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          Слабый промпт может получить высокий балл, если судья завышает оценки — именно поэтому
          Pareto использует относительное доминирование, а не пороговые значения.
        </p>
      </div>

      {/* Operators used */}
      {opsUsed.length > 0 && (
        <div className="card border-[#2a2d3e]">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Операторы мутации в этой ветке</div>
          <div className="space-y-3">
            {opsUsed.map(op => {
              const d = OPERATOR_DESCRIPTIONS[op]
              if (!d) return null
              const count = lineage.prompts.filter(p => p.mutation_op === op).length
              return (
                <div key={op} className="flex gap-3">
                  <span className="text-xl shrink-0 mt-0.5">{d.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-300">{d.short}</span>
                      <span className="text-xs text-gray-600">{count} промпт{count > 1 ? "а" : ""}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{d.long}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Criteria & evaluation method */}
      <div className="card border-[#2a2d3e]">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Критерии оценки (1–10 каждый)</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { key: "instruction_following", label: "Следование инструкции",
              desc: "Ответ охватывает все требования промпта? Пропущенные ограничения снижают оценку. (IFEval, Zhou 2023)" },
            { key: "logic_accuracy", label: "Логика и точность",
              desc: "Фактическая корректность и обоснованность. Реальные верифицируемые ссылки повышают оценку, галлюцинации снижают. (FactScore, Min 2023)" },
            { key: "density", label: "Плотность (анти-вода)",
              desc: "Информация на слово. Штрафует за AI-заглушки: «Конечно!», «Важно отметить», избыточные оговорки, повторения. (Liu 2023)" },
            { key: "specificity", label: "Конкретность",
              desc: "Конкретные детали: названия инструментов, реальные числа, практические примеры. Расплывчатые обобщения — низкая оценка. (HELM, Liang 2022)" },
          ].map(c => (
            <div key={c.key} className="p-3 bg-[#0a0c12] rounded-lg border border-[#2a2d3e]">
              <div className="text-sm font-medium text-gray-300 mb-1">{c.label}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[#2a2d3e] text-xs text-gray-600">
          <strong className="text-gray-500">Blind Double-Shuffle</strong> — каждая пара ответов сравнивается дважды
          (A→B, затем B→A со сменой позиций). Если судья выбирает разные результаты в двух прогонах —
          ничья. Это устраняет позиционное смещение.
        </div>
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
