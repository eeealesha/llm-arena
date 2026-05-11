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
  seed:          { icon: "🌱", short: "Seed",         long: "The initial prompt you provided. Starting point for all mutations." },
  zero_order:    { icon: "🎲", short: "Zero-order",   long: "Generates a completely fresh prompt from the theme alone — no parent. High variance, good for exploration." },
  first_order:   { icon: "✏️", short: "First-order",  long: "Takes a parent prompt and applies a sampled rewrite instruction (e.g. 'make it shorter', 'add structure'). Low variance." },
  hyper:         { icon: "🌀", short: "Hyper-mut",    long: "Self-referential: first invents a new mutation operation, then applies it. Can produce surprising results." },
  lamarckian:    { icon: "🧬", short: "Lamarckian",   long: "Reverse-engineers the ideal prompt by studying the best response produced so far. Adapts to what actually works." },
  eda:           { icon: "📊", short: "EDA",          long: "Estimation of Distribution: synthesises a new prompt by analysing patterns across the top-N scored prompts." },
  eda_rank_index:{ icon: "📈", short: "EDA-rank",     long: "Like EDA but shows the model a ranked list and asks it to generate a prompt that would beat rank #1." },
  lineage_based: { icon: "🌿", short: "Lineage",      long: "Shows the full ancestor chain (gen 0 → gen N) and asks the model to extrapolate the next evolutionary step." },
  crossover:     { icon: "✂️", short: "Crossover",    long: "Picks two parent prompts and combines their best elements — like genetic crossover." },
  workbook:      { icon: "📓", short: "Workbook",     long: "Uses multiple high-quality outputs as examples and reverse-engineers the prompt that would consistently produce them." },
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
        <Link href="/prompts" className="hover:text-gray-300 transition-colors">Evolution</Link>
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
          <Stat label="Prompts" value={lineage.prompts.length} />
          <Stat label="Generations" value={lineage.generations.length} />
          <Stat label="Pareto-optimal" value={pareto.length} accent="amber" />
          <Stat label="Evaluations" value={totalEvals} />
          {best && (
            <Stat label="Best avg score" value={`${best.fitness.avg_score.toFixed(2)}/10`} accent="indigo" />
          )}
        </div>
      </div>

      {/* Score progression */}
      {genProgress.length > 1 && (
        <div className="card border-[#2a2d3e]">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Score progression by generation</div>
          <div className="space-y-2">
            {genProgress.map(gp => (
              <div key={gp.gen} className="flex items-center gap-3 text-xs">
                <span className="text-gray-600 w-12">gen {gp.gen}</span>
                <div className="flex-1 h-2 bg-[#2a2d3e] rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(gp.best / 10) * 100}%` }} />
                </div>
                <span className="text-gray-400 font-mono w-16 text-right">
                  best {gp.best.toFixed(2)} <span className="text-gray-600">/ avg {gp.avg.toFixed(2)}</span>
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
            Seed prompt → best evolved prompt
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌱</span>
                <span className="text-sm font-medium text-gray-300">Gen 0 seed</span>
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
                <span className="text-sm font-medium text-indigo-300">Best evolved (gen {best.generation})</span>
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
              <div className="text-xs text-gray-600 mb-2">Criteria improvement (seed → best)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CRITERIA.map(c => {
                  const seedVal = (seed.fitness as Record<string, number>)[c] ?? 0
                  const bestVal = (best.fitness as Record<string, number>)[c] ?? 0
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
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">What is Pareto-optimal? ★</div>
        <p className="text-sm text-gray-400 leading-relaxed">
          A prompt is <span className="text-amber-300">Pareto-optimal</span> if no other prompt is better on{" "}
          <em>all</em> criteria simultaneously. For example: prompt A scores higher on{" "}
          <em>density</em> but lower on <em>specificity</em> than prompt B — both are Pareto-optimal
          because neither dominates the other completely. The Pareto frontier gives you a set of
          the best trade-offs, not a single winner.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          A super-weak prompt may score high if the judge inflates scores — that&apos;s why Pareto uses
          relative dominance, not raw score thresholds.
        </p>
      </div>

      {/* Operators used */}
      {opsUsed.length > 0 && (
        <div className="card border-[#2a2d3e]">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Mutation operators used in this lineage</div>
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
                      <span className="text-xs text-gray-600">{count} prompt{count > 1 ? "s" : ""}</span>
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
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-3">Scoring criteria (1–10 each)</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { key: "instruction_following", label: "Instruction following",
              desc: "Does the response address every requirement in the prompt? Missed constraints are penalised." },
            { key: "logic_accuracy", label: "Logic & accuracy",
              desc: "Factual correctness and sound reasoning. Real verifiable references raise the score; hallucinations lower it." },
            { key: "density", label: "Density (anti-filler)",
              desc: "Information per word. Penalises AI-filler: 'Certainly!', 'It is important to note', excessive hedging, repetition." },
            { key: "specificity", label: "Specificity",
              desc: "Concrete details: named tools, real numbers, actionable examples. Vague generalities score low." },
          ].map(c => (
            <div key={c.key} className="p-3 bg-[#0a0c12] rounded-lg border border-[#2a2d3e]">
              <div className="text-sm font-medium text-gray-300 mb-1">{c.label}</div>
              <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-[#2a2d3e] text-xs text-gray-600">
          <strong className="text-gray-500">Blind Double-Shuffle</strong> — every pair of responses is
          compared twice (A→B then B→A with positions swapped). If the judge picks differently in each
          pass, the result is a tie. This eliminates position bias.
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
