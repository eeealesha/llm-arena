"use client"
import { useEffect, useRef, useState } from "react"

interface TsEntry { model: string; rank: number; ts: number; mu: number; sigma: number; W: number; L: number; D: number }
interface MatchEvent { round: number; match: number; A: string; B: string; verdict: string; reasoning: string; scores_a: Record<string, number>; scores_b: Record<string, number>; ts_a: number; ts_b: number }
interface RoundEnd { round: number; standings: TsEntry[]; comment: string | null }
interface ArticleStep { step: string; model: string; words?: number; time?: number; done: boolean }
interface ArticleState { topic: string; style: string; steps: ArticleStep[]; done: { id: string; words: number } | null }

interface CriteriaScores { instruction_following: number; logic_accuracy: number; density: number; specificity: number }
interface Comparison {
  model_a: string; model_b: string
  verdict: "A" | "B" | "TIE"
  scores_a: Partial<CriteriaScores>; scores_b: Partial<CriteriaScores>
  reasoning?: string
}
interface EvolveEntry {
  id?: string
  parent_id?: string
  op: string
  generation: number
  status: "evaluating" | "evaluated" | "failed"
  fitness?: { avg_score: number; n_evals: number; win_rate?: number }
  is_pareto?: boolean
  text?: string
  comparisons?: Comparison[]
}
interface ResponseItem {
  model: string
  status: "writing" | "done" | "failed"
  words?: number
}
interface EvolveState {
  theme: string
  theme_slug: string
  generations: number
  current_gen: number
  contestants: string[]
  judge: string
  criteria: string[]
  entries: EvolveEntry[]
  active_responses: ResponseItem[]
  active_comparisons: Comparison[]
  done: boolean
}

const OP_META: Record<string, { icon: string; label: string; color: string; desc: string }> = {
  seed:          { icon: "🌱", label: "Seed",        color: "text-gray-400",   desc: "Initial prompt" },
  zero_order:    { icon: "🎲", label: "Zero-order",  color: "text-blue-300",   desc: "Fresh prompt generated from theme only" },
  first_order:   { icon: "✏️", label: "First-order", color: "text-purple-300", desc: "Parent mutated using a sampled mutation instruction" },
  hyper:         { icon: "🌀", label: "Hyper-mut",   color: "text-pink-300",   desc: "Self-referential: invented a new mutation op, then applied it" },
  lamarckian:    { icon: "🧬", label: "Lamarckian",  color: "text-amber-300",  desc: "Reverse-engineered from the best response" },
  eda:           { icon: "📊", label: "EDA",         color: "text-emerald-300",desc: "Synthesised from patterns in top-N population prompts" },
  eda_rank_index:{ icon: "📈", label: "EDA-rank",    color: "text-teal-300",   desc: "Generated to beat the current rank-1 prompt" },
  lineage_based: { icon: "🌿", label: "Lineage",     color: "text-orange-300", desc: "Extrapolated from the full ancestor chain" },
  crossover:     { icon: "✂️", label: "Crossover",   color: "text-fuchsia-300",desc: "Best elements of two parent prompts combined" },
  workbook:      { icon: "📓", label: "Workbook",    color: "text-rose-300",   desc: "Reverse-engineered from multiple high-quality outputs" },
}

const CRITERIA_LABELS: Record<string, string> = {
  instruction_following: "Follows instructions",
  logic_accuracy:        "Factual accuracy",
  density:               "No filler / dense",
  specificity:           "Concrete & specific",
}

const STEP_META: Record<string, { icon: string; label: string }> = {
  planner:      { icon: "📋", label: "Планёр" },
  author_draft: { icon: "✍️", label: "Черновик автора" },
  editor_v1:    { icon: "✅", label: "Редактура v1" },
  author_v2:    { icon: "✍️", label: "Доработка v2" },
  editor_v2:    { icon: "✅", label: "Редактура v2" },
  chief_editor: { icon: "👑", label: "Выпускающий редактор" },
}

function stepMeta(step: string) {
  if (step in STEP_META) return STEP_META[step]
  if (step.startsWith("editor_v")) return { icon: "✅", label: `Редактура v${step.slice(-1)}` }
  if (step.startsWith("author_v")) return { icon: "✍️", label: `Доработка v${step.slice(-1)}` }
  return { icon: "•", label: step }
}

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }
function scoreTotal(s: Record<string, number> | undefined) {
  if (!s) return null
  return Object.values(s).reduce((a, b) => a + b, 0)
}

function PostCard({ model, words, text }: { model: string; words: number; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#2a2d3e] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#1a1d27] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          <span className="text-gray-200 font-medium">{shortName(model)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{words} слов</span>
          <span className="text-gray-600 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-[#2a2d3e] px-4 py-3 bg-[#0a0c12]">
          <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
        </div>
      )}
    </div>
  )
}

function MatchCard({ m }: { m: MatchEvent }) {
  const [open, setOpen] = useState(false)
  const won_a = m.verdict === "A"
  const won_b = m.verdict === "B"
  const sa = scoreTotal(m.scores_a)
  const sb = scoreTotal(m.scores_b)
  return (
    <div className="border border-[#2a2d3e] rounded-lg overflow-hidden text-sm">
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-stretch cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <div className={`flex items-center gap-2 px-3 py-2.5 ${won_a ? "bg-emerald-950/30" : won_b ? "opacity-50" : ""}`}>
          <div className={`w-0.5 h-6 rounded-full shrink-0 ${won_a ? "bg-emerald-500" : "bg-[#2a2d3e]"}`} />
          <span className={won_a ? "text-white font-medium" : "text-gray-400"}>{shortName(m.A)}</span>
          {sa !== null && <span className={`ml-auto text-xs ${won_a ? "text-emerald-400" : "text-gray-600"}`}>{sa}/20</span>}
        </div>
        <div className="flex flex-col items-center justify-center px-3 border-x border-[#2a2d3e] text-xs text-gray-500 bg-[#0f1117]">
          <span>М{m.match}</span>
          <span className={`font-bold mt-0.5 ${m.verdict === "DRAW" ? "text-amber-400" : "text-gray-300"}`}>
            {m.verdict === "DRAW" ? "=" : m.verdict}
          </span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2.5 flex-row-reverse ${won_b ? "bg-emerald-950/30" : won_a ? "opacity-50" : ""}`}>
          <div className={`w-0.5 h-6 rounded-full shrink-0 ${won_b ? "bg-emerald-500" : "bg-[#2a2d3e]"}`} />
          <span className={won_b ? "text-white font-medium" : "text-gray-400"}>{shortName(m.B)}</span>
          {sb !== null && <span className={`mr-auto text-xs ${won_b ? "text-emerald-400" : "text-gray-600"}`}>{sb}/20</span>}
        </div>
      </div>
      {open && (
        <div className="border-t border-[#2a2d3e] bg-[#0a0c12] px-4 py-3 space-y-3">
          <p className="text-gray-300 text-sm leading-relaxed">{m.reasoning}</p>
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div className="space-y-0.5">
              <div className="text-gray-400 font-medium mb-1">{shortName(m.A)}</div>
              {Object.entries(m.scores_a || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span>{k}</span><span className="text-gray-300">{v}</span></div>
              ))}
              <div className="flex justify-between border-t border-[#2a2d3e] mt-1 pt-1 text-gray-400 font-medium"><span>TS</span><span>{m.ts_a}</span></div>
            </div>
            <div className="space-y-0.5">
              <div className="text-gray-400 font-medium mb-1">{shortName(m.B)}</div>
              {Object.entries(m.scores_b || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span>{k}</span><span className="text-gray-300">{v}</span></div>
              ))}
              <div className="flex justify-between border-t border-[#2a2d3e] mt-1 pt-1 text-gray-400 font-medium"><span>TS</span><span>{m.ts_b}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ScoreBars({ scores, max = 10 }: { scores: Partial<CriteriaScores>; max?: number }) {
  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"]
  const keys = Object.keys(scores) as (keyof CriteriaScores)[]
  return (
    <div className="space-y-0.5">
      {keys.map((c, i) => {
        const v = scores[c] ?? 0
        return (
          <div key={c} className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-600 w-14 truncate">{CRITERIA_LABELS[c] ?? c}</span>
            <div className="flex-1 h-1.5 bg-[#2a2d3e] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                   style={{ width: `${(v / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
            </div>
            <span className="text-[10px] font-mono text-gray-400 w-5 text-right">{v}</span>
          </div>
        )
      })}
    </div>
  )
}

function ComparisonCard({ c }: { c: Comparison }) {
  const [open, setOpen] = useState(false)
  const verdictColor = c.verdict === "TIE" ? "text-amber-400" : "text-emerald-400"
  const verdictLabel =
    c.verdict === "A" ? `${shortName(c.model_a)} wins` :
    c.verdict === "B" ? `${shortName(c.model_b)} wins` : "Tie"
  const avgA = c.scores_a ? Object.values(c.scores_a).reduce((a, b) => a + b, 0) / Object.values(c.scores_a).length : 0
  const avgB = c.scores_b ? Object.values(c.scores_b).reduce((a, b) => a + b, 0) / Object.values(c.scores_b).length : 0

  return (
    <div className="border border-[#2a2d3e] rounded-lg overflow-hidden text-xs">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1a1d27] transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-gray-500">⚖️</span>
        <span className="text-gray-400">{shortName(c.model_a)}</span>
        <span className="text-gray-600">vs</span>
        <span className="text-gray-400">{shortName(c.model_b)}</span>
        <span className={`ml-auto font-medium ${verdictColor}`}>{verdictLabel}</span>
        <span className="text-gray-600 ml-1">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-[#2a2d3e] bg-[#0a0c12] px-3 py-3 space-y-3">
          {c.reasoning && (
            <p className="text-gray-400 text-xs leading-relaxed italic">{c.reasoning}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-gray-300 font-medium mb-1.5">{shortName(c.model_a)} <span className="text-gray-600 font-normal">(avg {avgA.toFixed(1)})</span></div>
              <ScoreBars scores={c.scores_a} />
            </div>
            <div>
              <div className="text-gray-300 font-medium mb-1.5">{shortName(c.model_b)} <span className="text-gray-600 font-normal">(avg {avgB.toFixed(1)})</span></div>
              <ScoreBars scores={c.scores_b} />
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">
            Blind Double-Shuffle: both positions tested, verdict only if consistent.
          </p>
        </div>
      )}
    </div>
  )
}

function PromptCard({ e, isActive }: { e: EvolveEntry; isActive?: boolean }) {
  const [open, setOpen] = useState(false)
  const meta = OP_META[e.op] ?? { icon: "•", label: e.op, color: "text-gray-300", desc: "" }
  const avgScore = e.fitness?.avg_score ?? 0

  return (
    <div className={`border rounded-lg overflow-hidden text-sm transition-colors ${
      e.is_pareto   ? "border-amber-700/50 bg-amber-950/10" :
      isActive      ? "border-fuchsia-700/40 bg-fuchsia-950/10" :
      e.status === "failed" ? "border-rose-900/30 opacity-50" :
      "border-[#2a2d3e]"
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span title={meta.desc}>{meta.icon}</span>
        <span className={`text-xs font-medium ${meta.color}`} title={meta.desc}>{meta.label}</span>
        {e.is_pareto && (
          <span title="Pareto-optimal: no other prompt dominates this on ALL criteria simultaneously"
                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 cursor-help">
            ★ Pareto
          </span>
        )}
        {isActive && (
          <span className="text-[10px] text-fuchsia-400 inline-flex items-center gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
            evaluating…
          </span>
        )}
        {e.fitness && (
          <span className="ml-auto text-xs font-mono text-gray-400">
            {avgScore.toFixed(1)}
            {e.fitness.win_rate != null && (
              <span className="text-gray-600 ml-1">· {(e.fitness.win_rate * 100).toFixed(0)}%wr</span>
            )}
          </span>
        )}
        {e.text && (
          <button onClick={() => setOpen(!open)} className="text-gray-600 hover:text-gray-400 text-xs ml-1">
            {open ? "▲" : "▼"}
          </button>
        )}
      </div>

      {/* Score bar */}
      {e.fitness && (
        <div className="px-3 pb-2">
          <div className="h-1.5 bg-[#2a2d3e] rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${(avgScore / 10) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Expanded: prompt text + comparisons */}
      {open && (
        <div className="border-t border-[#2a2d3e] px-3 py-3 bg-[#0a0c12] space-y-3">
          <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{e.text}</p>
          {e.comparisons && e.comparisons.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase text-gray-600 tracking-wide">Judge comparisons</div>
              {e.comparisons.map((c, i) => <ComparisonCard key={i} c={c} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EvolvePipeline({ evolve }: { evolve: EvolveState }) {
  const byGen: Record<number, EvolveEntry[]> = {}
  for (const e of evolve.entries) {
    (byGen[e.generation] = byGen[e.generation] || []).push(e)
  }
  const gens = Object.keys(byGen).map(Number).sort((a, b) => a - b)
  const evaluated = evolve.entries.filter(e => e.status === "evaluated")
  const bestSoFar = [...evaluated].sort((a, b) => (b.fitness?.avg_score ?? 0) - (a.fitness?.avg_score ?? 0))[0]
  const paretoCount = evaluated.filter(e => e.is_pareto).length
  const activeEntry = evolve.entries.find(e => e.status === "evaluating")

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="card border-fuchsia-700/40 bg-fuchsia-950/10">
        <div className="text-xs uppercase tracking-wide text-fuchsia-400 mb-1">🧬 Prompt Evolution</div>
        <div className="text-white font-semibold leading-snug">{evolve.theme}</div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
          <span>Generation <span className="text-gray-300 font-medium">{evolve.current_gen}</span> / {evolve.generations}</span>
          <span>
            <span title="Pareto-optimal: prompts where no other prompt is better on ALL criteria at once" className="cursor-help">
              ★ Pareto
            </span>: <span className="text-amber-300 font-medium">{paretoCount}</span>
          </span>
          {bestSoFar?.fitness && (
            <span>Best avg: <span className="text-indigo-300 font-mono">{bestSoFar.fitness.avg_score.toFixed(2)}/10</span></span>
          )}
          <span>Judge: <span className="text-gray-300">{shortName(evolve.judge)}</span></span>
        </div>
        {evolve.criteria?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {evolve.criteria.map(c => (
              <span key={c} title={CRITERIA_LABELS[c]} className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1d27] border border-[#2a2d3e] text-gray-500">
                {c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Currently generating responses */}
      {(evolve.active_responses.length > 0 || evolve.active_comparisons.length > 0) && !evolve.done && (
        <div className="card border-fuchsia-800/30 bg-[#0f0d18] space-y-3">
          <div className="text-xs uppercase tracking-wide text-fuchsia-400">
            ⚡ Evaluating {activeEntry ? `"${(activeEntry.text ?? "").slice(0, 60)}…"` : "…"}
          </div>

          {/* Step 1: models writing */}
          {evolve.active_responses.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">Step 1 — Generate responses</div>
              <div className="space-y-1">
                {evolve.active_responses.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={r.status === "done" ? "text-emerald-400" : r.status === "failed" ? "text-rose-400" : "text-fuchsia-400 animate-pulse"}>
                      {r.status === "done" ? "✓" : r.status === "failed" ? "✗" : "•"}
                    </span>
                    <span className="text-gray-300">{shortName(r.model)}</span>
                    {r.words && <span className="text-gray-600 ml-auto">{r.words} words</span>}
                    {r.status === "writing" && <span className="text-fuchsia-500 ml-auto text-[10px] animate-pulse">writing…</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: double-shuffle comparisons */}
          {evolve.active_comparisons.length > 0 && (
            <div>
              <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-1.5">
                Step 2 — Blind Double-Shuffle comparisons
              </div>
              <div className="space-y-1.5">
                {evolve.active_comparisons.map((c, i) => <ComparisonCard key={i} c={c} />)}
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">
                Each pair is compared twice with positions swapped. Inconsistent result → Tie.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Per-generation prompt cards */}
      <div className="space-y-5">
        {gens.map(g => (
          <div key={g}>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xs font-bold text-fuchsia-400 uppercase tracking-widest">
                {g === 0 ? "gen 0 — seed" : `gen ${g}`}
              </div>
              <div className="flex-1 h-px bg-[#2a2d3e]" />
              <span className="text-xs text-gray-600">{byGen[g].length} prompt{byGen[g].length > 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-2">
              {byGen[g].map((e, i) => (
                <PromptCard key={`${e.id ?? "x"}-${i}`} e={e} isActive={e.status === "evaluating"} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Done */}
      {evolve.done && (
        <div className="card border-emerald-800/50 bg-emerald-950/20 text-center py-6">
          <div className="text-3xl mb-2">🏁</div>
          <div className="text-white font-bold text-lg">Evolution complete</div>
          <div className="text-gray-400 text-sm mt-1">
            {evolve.entries.length} prompts evaluated · {paretoCount} Pareto-optimal
          </div>
          {bestSoFar?.fitness && (
            <div className="text-emerald-400 text-sm mt-1">
              Best prompt avg score: <span className="font-mono font-bold">{bestSoFar.fitness.avg_score.toFixed(2)}/10</span>
            </div>
          )}
          <a href={`/prompts/${evolve.theme_slug}`}
             className="mt-4 inline-block px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors">
            View full tree →
          </a>
        </div>
      )}
    </div>
  )
}

function ArticlePipeline({ article }: { article: ArticleState }) {
  const styleIcon = article.style === "storyteller" ? "✍️" : "🔬"
  return (
    <div className="space-y-4">
      <div className="card border-indigo-700/40 bg-indigo-950/10">
        <div className="text-xs uppercase tracking-wide text-indigo-400 mb-1">
          {styleIcon} {article.style === "storyteller" ? "Сторителлер" : "Аналитик"} · пишет статью
        </div>
        <div className="text-white font-semibold leading-snug">{article.topic}</div>
      </div>

      <div className="relative pl-6">
        {/* vertical line */}
        <div className="absolute left-[10px] top-2 bottom-2 w-px bg-[#2a2d3e]" />
        {article.steps.length === 0 ? (
          <div className="text-gray-600 text-sm py-2">Готовлю редакцию...</div>
        ) : (
          article.steps.map((s, i) => {
            const meta = stepMeta(s.step)
            const isCurrent = !s.done
            return (
              <div key={`${s.step}-${i}`} className="relative pb-4 last:pb-0">
                {/* node */}
                <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  s.done
                    ? "bg-emerald-600/30 text-emerald-300 border border-emerald-600/50"
                    : "bg-indigo-600/30 text-indigo-300 border border-indigo-600/50 animate-pulse"
                }`}>
                  {s.done ? "✓" : "•"}
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base">{meta.icon}</span>
                  <span className={`text-sm font-medium ${isCurrent ? "text-white" : "text-gray-300"}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-gray-500 font-mono">{shortName(s.model)}</span>
                  {s.done && s.words !== undefined && (
                    <span className="text-xs text-gray-600 ml-auto shrink-0">
                      {s.words} слов{s.time ? ` · ${s.time}s` : ""}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-xs text-indigo-400 ml-auto shrink-0 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      пишет...
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {article.done && (
        <div className="card border-emerald-800/50 bg-emerald-950/20 text-center py-5">
          <div className="text-3xl mb-1">📝</div>
          <div className="text-white font-bold">Статья готова</div>
          <div className="text-emerald-400 text-xs mt-1">{article.done.words} слов</div>
          <a href={`/blog/${article.done.id}`}
             className="mt-3 inline-block px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors">
            Открыть статью →
          </a>
        </div>
      )}
    </div>
  )
}

function RoundSection({ rnd, matches, comment }: { rnd: number; matches: MatchEvent[]; comment: string | null }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Раунд {rnd}</div>
        <div className="flex-1 h-px bg-[#2a2d3e]" />
        <span className="text-xs text-gray-600">{matches.length} матчей</span>
      </div>
      {matches.map((m) => <MatchCard key={m.match} m={m} />)}
      {comment && (
        <div className="mt-2 px-4 py-3 rounded-lg bg-indigo-950/20 border border-indigo-900/40 text-sm text-indigo-200 leading-relaxed">
          🎙️ {comment}
        </div>
      )}
    </div>
  )
}

const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export default function TournamentLive() {
  const [status, setStatus]       = useState<string>("connecting")
  const [posts, setPosts]         = useState<Record<string, { words: number; text: string }>>({})
  const [matches, setMatches]     = useState<MatchEvent[]>([])
  const [rounds, setRounds]       = useState<RoundEnd[]>([])
  const [standings, setStandings] = useState<TsEntry[]>([])
  const [statusMsg, setStatusMsg] = useState<string>("")
  const [config, setConfig]       = useState<{ contestants: string[]; rounds: number; judge: string } | null>(null)
  const [done, setDone]           = useState<{ winner: string; tournament_id: string } | null>(null)
  const [tab, setTab]             = useState<"matches" | "posts">("matches")
  const [article, setArticle]     = useState<ArticleState | null>(null)
  const [evolve, setEvolve]       = useState<EvolveState | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    connect()
    return () => esRef.current?.close()
  }, [])

  function connect() {
    if (esRef.current) esRef.current.close()
    const es = new EventSource("/api/runner/stream")
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data)
        handleEvent(evt)
        if (evt.type === "runner_end") es.close()
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      setStatus(s => s === "running" ? "disconnected" : s)
      es.close()
    }
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case "config":
        setConfig({ contestants: (evt.contestants as string[]) || [], rounds: 0, judge: (evt.judge as string) || "" })
        setStatus("running")
        break
      case "tournament_start":
        setConfig(c => c ? { ...c, rounds: evt.rounds as number } : null)
        setStatus("running")
        break
      case "post_done":
        setPosts(p => ({ ...p, [evt.model as string]: { words: evt.words as number, text: evt.text as string || "" } }))
        setTab("posts")
        break
      case "match_start":
        setStatus("running")
        setStatusMsg(`Раунд ${evt.round}, матч ${evt.match}: ${shortName(evt.A as string)} vs ${shortName(evt.B as string)}`)
        break
      case "match":
        setMatches(ms => [...ms, evt as unknown as MatchEvent])
        setTab("matches")
        break
      case "round_end": {
        const re = evt as unknown as RoundEnd
        setRounds(rs => {
          const idx = rs.findIndex(r => r.round === re.round)
          if (idx >= 0) { const next = [...rs]; next[idx] = re; return next }
          return [...rs, re]
        })
        setStandings(re.standings || [])
        break
      }
      case "comment_start":
        setStatusMsg(`Комментатор пишет про раунд ${evt.round}...`)
        break
      case "status":
        setStatusMsg(evt.message as string)
        break
      case "done":
        setDone({ winner: evt.winner as string, tournament_id: evt.tournament_id as string })
        setStatus("done")
        setStatusMsg("")
        break
      case "runner_start":
        setStatus("running")
        setPosts({})
        setMatches([])
        setRounds([])
        setStandings([])
        setDone(null)
        setConfig(null)
        setArticle(null)
        setEvolve(null)
        setStatusMsg("")
        break
      case "evolve_start":
        setStatus("running")
        setEvolve({
          theme:            evt.theme as string || "",
          theme_slug:       evt.theme_slug as string || "",
          generations:      evt.generations as number ?? 0,
          current_gen:      0,
          contestants:      (evt.contestants as string[]) || [],
          judge:            evt.judge as string || "",
          criteria:         (evt.criteria as string[]) || [],
          entries:          [],
          active_responses: [],
          active_comparisons: [],
          done:             false,
        })
        setStatusMsg(`Evolution: ${evt.theme as string || ""}`)
        break
      case "generation_start":
        setEvolve(s => s ? { ...s, current_gen: evt.gen as number, active_responses: [], active_comparisons: [] } : s)
        setStatusMsg(`Generation ${evt.gen}: ${evt.candidates} candidates`)
        break
      case "mutation_attempt":
        setStatusMsg(`Mutating (${evt.op as string})…`)
        break
      case "mutation_done":
        setEvolve(s => s ? {
          ...s,
          entries: [...s.entries, {
            id:         evt.id as string,
            parent_id:  evt.parent_id as string,
            op:         evt.op as string,
            generation: evt.gen as number,
            status:     "evaluating" as const,
            text:       evt.text as string,
            comparisons: [],
          }],
          active_responses:   [],
          active_comparisons: [],
        } : s)
        setStatusMsg(`Mutation done (${evt.op as string}) → evaluating…`)
        break
      case "mutation_failed":
        setStatusMsg(`Mutation failed (${evt.op as string}): ${evt.reason as string || ""}`)
        break
      case "prompt_evaluating":
        setEvolve(s => {
          if (!s) return s
          // Ensure seed prompts (no mutation_done event) get an entry
          const hasEntry = s.entries.some(e => e.id === evt.id)
          if (!hasEntry) {
            return {
              ...s,
              entries: [...s.entries, {
                id:         evt.id as string,
                op:         evt.op as string || "seed",
                generation: evt.generation as number ?? 0,
                status:     "evaluating" as const,
                comparisons: [],
              }],
              active_responses:   [],
              active_comparisons: [],
            }
          }
          return { ...s, active_responses: [], active_comparisons: [] }
        })
        setStatusMsg(`Evaluating prompt ${(evt.id as string)?.slice(0, 8) ?? ""}…`)
        break
      case "minibatch_post_start":
        setEvolve(s => s ? {
          ...s,
          active_responses: [...s.active_responses, { model: evt.model as string, status: "writing" as const }],
        } : s)
        break
      case "minibatch_post_done":
        setEvolve(s => s ? {
          ...s,
          active_responses: s.active_responses.map(r =>
            r.model === evt.model ? { ...r, status: "done" as const, words: evt.words as number } : r
          ),
        } : s)
        break
      case "minibatch_post_failed":
        setEvolve(s => s ? {
          ...s,
          active_responses: s.active_responses.map(r =>
            r.model === evt.model ? { ...r, status: "failed" as const } : r
          ),
        } : s)
        break
      case "minibatch_judged": {
        const cmp: Comparison = {
          model_a:   evt.model_a as string,
          model_b:   evt.model_b as string,
          verdict:   evt.verdict as "A" | "B" | "TIE",
          scores_a:  (evt.scores_a as Partial<CriteriaScores>) || {},
          scores_b:  (evt.scores_b as Partial<CriteriaScores>) || {},
          reasoning: evt.reasoning as string | undefined,
        }
        setEvolve(s => {
          if (!s) return s
          const activeId = s.entries.find(e => e.status === "evaluating")?.id
          return {
            ...s,
            active_comparisons: [...s.active_comparisons, cmp],
            entries: s.entries.map(e => e.id === activeId
              ? { ...e, comparisons: [...(e.comparisons ?? []), cmp] }
              : e
            ),
          }
        })
        break
      }
      case "prompt_evaluated":
        setEvolve(s => s ? {
          ...s,
          entries: s.entries.map(e => e.id === evt.id ? {
            ...e,
            status:    "evaluated" as const,
            fitness:   evt.fitness as { avg_score: number; n_evals: number; win_rate?: number },
            is_pareto: evt.is_pareto as boolean,
            text:      (evt.text as string | undefined) ?? e.text,
          } : e),
          active_responses:   [],
          active_comparisons: [],
        } : s)
        break
      case "generation_done":
        setStatusMsg(`Generation ${evt.gen as number} complete`)
        break
      case "evolve_done":
        setEvolve(s => s ? { ...s, done: true, theme_slug: evt.theme_slug as string || s.theme_slug } : s)
        setStatus("done")
        setStatusMsg("")
        break
      case "article_start":
        setStatus("running")
        setArticle({
          topic: evt.topic as string || "",
          style: evt.style as string || "storyteller",
          steps: [],
          done: null,
        })
        setStatusMsg(`Пишу статью: ${evt.topic as string || ""}`)
        break
      case "article_step":
        setArticle(a => a ? {
          ...a,
          steps: [...a.steps, { step: evt.step as string, model: evt.model as string, done: false }],
        } : a)
        setStatusMsg(`${stepMeta(evt.step as string).label}: ${shortName(evt.model as string)}`)
        break
      case "article_step_done":
        setArticle(a => {
          if (!a) return a
          const steps = [...a.steps]
          // mark the last matching step as done
          for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].step === evt.step && !steps[i].done) {
              steps[i] = { ...steps[i], done: true, words: evt.words as number, time: evt.time as number }
              break
            }
          }
          return { ...a, steps }
        })
        break
      case "article_done":
        setArticle(a => a ? { ...a, done: { id: evt.id as string, words: evt.words as number }, steps: a.steps.map(s => ({ ...s, done: true })) } : a)
        setStatus("done")
        setStatusMsg("")
        break
      case "error":
        setStatusMsg(`Ошибка: ${evt.message}`)
        setStatus("error")
        break
      case "runner_end":
        setStatus(s => s === "running" ? "idle" : s)
        break
      case "cancelled":
        setStatus("idle")
        setStatusMsg("Остановлено")
        break
    }
  }

  const matchesByRound: Record<number, MatchEvent[]> = {}
  for (const m of matches) {
    (matchesByRound[m.round] = matchesByRound[m.round] || []).push(m)
  }
  const roundNums = Array.from(
    new Set([...Object.keys(matchesByRound).map(Number), ...rounds.map(r => r.round)])
  ).sort((a, b) => a - b)

  const postModels = Object.keys(posts)
  const isRunning = status === "running"
  const isArticleMode = article !== null
  const isEvolveMode  = evolve !== null
  const hasData = matches.length > 0 || postModels.length > 0 || done !== null || isArticleMode || isEvolveMode

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
        isRunning       ? "border-indigo-700/50 bg-indigo-950/20 text-indigo-300" :
        status === "done"    ? "border-emerald-700/50 bg-emerald-950/20 text-emerald-300" :
        status === "error"   ? "border-rose-700/50 bg-rose-950/20 text-rose-300" :
        status === "connecting" ? "border-[#2a2d3e] text-gray-600" :
        "border-[#2a2d3e] text-gray-500"
      }`}>
        {isRunning && <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />}
        <span className="font-medium shrink-0">
          {isRunning ? "Идёт турнир" : status === "done" ? "Завершён" :
           status === "connecting" ? "Подключение..." : status === "error" ? "Ошибка" : "Ожидание"}
        </span>
        {statusMsg && <span className="text-gray-400 text-xs truncate">{statusMsg}</span>}
        {isRunning && (
          <button
            onClick={() => fetch("/api/runner/cancel", { method: "POST" })}
            className="ml-auto shrink-0 text-rose-400 hover:text-rose-300 text-xs border border-rose-800/50 px-2 py-0.5 rounded"
          >
            Стоп
          </button>
        )}
      </div>

      {/* Evolution pipeline (takes over when prompts are evolving) */}
      {isEvolveMode && <EvolvePipeline evolve={evolve!} />}

      {/* Article pipeline (takes over the view when an article is being written) */}
      {!isEvolveMode && isArticleMode && <ArticlePipeline article={article!} />}

      {/* Done banner */}
      {!isArticleMode && !isEvolveMode && done && (
        <div className="card border-emerald-800/50 bg-emerald-950/20 text-center py-5">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-white font-bold">{shortName(done.winner)}</div>
          <div className="text-emerald-400 text-xs mt-1">Победитель</div>
          <a href={`/tournament/${done.tournament_id}`}
             className="mt-3 inline-block px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors">
            Открыть результаты →
          </a>
        </div>
      )}

      {/* Config summary */}
      {!isArticleMode && !isEvolveMode && config && (
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="px-2 py-1 rounded bg-[#1a1d27] border border-[#2a2d3e]">
            {config.contestants.length} участников
          </span>
          {config.rounds > 0 && (
            <span className="px-2 py-1 rounded bg-[#1a1d27] border border-[#2a2d3e]">
              {config.rounds} раундов
            </span>
          )}
          <span className="px-2 py-1 rounded bg-[#1a1d27] border border-[#2a2d3e]">
            судья: {shortName(config.judge)}
          </span>
        </div>
      )}

      {/* Live standings */}
      {!isArticleMode && !isEvolveMode && standings.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#2a2d3e] text-xs text-gray-500 uppercase tracking-wide">
            Рейтинг
          </div>
          <div className="divide-y divide-[#2a2d3e]">
            {standings.slice(0, 8).map((s, i) => (
              <div key={s.model} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-5 text-center shrink-0">{medals[i + 1] || <span className="text-gray-600">{i + 1}</span>}</span>
                <span className={`flex-1 truncate ${i === 0 ? "text-white font-medium" : "text-gray-300"}`}>
                  {shortName(s.model)}
                </span>
                <span className={`tabular-nums text-xs ${i === 0 ? "text-emerald-400" : "text-gray-500"}`}>
                  {s.ts.toFixed(1)}
                </span>
                <span className="text-xs text-gray-600 w-20 text-right">{s.W}W {s.L}L {s.D}D</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: matches / posts (tournament mode only) */}
      {!isArticleMode && !isEvolveMode && hasData && (
        <div>
          <div className="flex gap-1 border-b border-[#2a2d3e] mb-4">
            <button
              onClick={() => setTab("matches")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "matches" ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              ⚔️ Матчи {matches.length > 0 && <span className="text-xs text-gray-600 ml-1">{matches.length}</span>}
            </button>
            <button
              onClick={() => setTab("posts")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "posts" ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              📝 Посты {postModels.length > 0 && <span className="text-xs text-gray-600 ml-1">{postModels.length}</span>}
            </button>
          </div>

          {tab === "matches" && (
            <div className="space-y-6">
              {roundNums.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">
                  {isRunning ? "Ожидаем начала матчей..." : "Матчей пока нет"}
                </div>
              ) : (
                roundNums.map(rnd => (
                  <RoundSection
                    key={rnd}
                    rnd={rnd}
                    matches={matchesByRound[rnd] || []}
                    comment={rounds.find(r => r.round === rnd)?.comment || null}
                  />
                ))
              )}
            </div>
          )}

          {tab === "posts" && (
            <div className="space-y-2">
              {postModels.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">
                  {isRunning ? "Модели пишут посты..." : "Постов пока нет"}
                </div>
              ) : (
                postModels.map(model => (
                  <PostCard
                    key={model}
                    model={model}
                    words={posts[model].words}
                    text={posts[model].text}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {!hasData && status !== "connecting" && status !== "running" && (
        <div className="text-center py-12 text-gray-600">
          <div className="text-4xl mb-3">⚔️</div>
          <div>Запусти турнир — результаты появятся здесь в реальном времени</div>
        </div>
      )}
    </div>
  )
}
