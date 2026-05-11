"use client"
import { useMemo, useState } from "react"
import { Lineage, OPERATOR_META, PromptNode, layoutLineage, CRITERIA } from "@/lib/lineage"

const NODE_W = 220
const NODE_H = 78
const COL    = 280
const ROW    = 140
const PAD_X  = 40
const PAD_Y  = 40

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }

function FitnessBars({ fitness }: { fitness: PromptNode["fitness"] }) {
  return (
    <div className="space-y-0.5">
      {CRITERIA.map((c, i) => {
        const val = fitness[c] ?? 0
        const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"]
        return (
          <div key={c} className="flex items-center gap-1.5">
            <span className="text-[9px] text-gray-500 w-6 uppercase">{c.slice(0, 3)}</span>
            <div className="flex-1 h-1 bg-[var(--border)] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, backgroundColor: colors[i] }} />
            </div>
            <span className="text-[9px] font-mono text-gray-400 w-4 text-right">{val.toFixed(1)}</span>
          </div>
        )
      })}
    </div>
  )
}

function PromptDetailPanel({ p, onClose }: { p: PromptNode; onClose: () => void }) {
  const opMeta = OPERATOR_META[p.mutation_op] ?? { label: p.mutation_op, color: "#888", icon: "•" }
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[var(--panel)] border-l border-[var(--border)] z-50 overflow-y-auto shadow-2xl">
      <div className="sticky top-0 bg-[var(--panel)] border-b border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{opMeta.icon}</span>
          <div className="min-w-0">
            <div className="text-xs text-gray-500 font-mono truncate">{p.id} · gen {p.generation}</div>
            <div className="text-sm text-white truncate">{opMeta.label}</div>
          </div>
          {p.is_pareto && (
            <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300 shrink-0">Pareto</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-200 text-lg">✕</button>
      </div>

      <div className="p-5 space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Текст промпта</div>
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap bg-[var(--surface-deep)] border border-[var(--border)] rounded-lg p-3">
            {p.text}
          </p>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            Fitness <span className="text-gray-600 normal-case">({p.fitness.n_evals} eval)</span>
          </div>
          <FitnessBars fitness={p.fitness} />
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>Avg: <span className="text-indigo-300 font-mono">{p.fitness.avg_score.toFixed(2)}</span></span>
            {p.fitness.win_rate != null && (
              <span>Win-rate: <span className="text-emerald-400 font-mono">{(p.fitness.win_rate * 100).toFixed(0)}%</span></span>
            )}
          </div>
        </div>

        {p.feedback_summary && (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Feedback от судьи</div>
            <p className="text-gray-300 text-sm leading-relaxed italic">{p.feedback_summary}</p>
          </div>
        )}

        {p.sample_outputs && Object.keys(p.sample_outputs).length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
              Образцы постов ({Object.keys(p.sample_outputs).length})
            </div>
            <div className="space-y-2">
              {Object.entries(p.sample_outputs).map(([model, post]) => (
                <details key={model} className="border border-[var(--border)] rounded-lg">
                  <summary className="cursor-pointer px-3 py-2 text-xs text-gray-400 hover:bg-[var(--surface-hover)]">
                    {shortName(model)} · {post.split(/\s+/).length} слов
                  </summary>
                  <p className="px-3 py-2 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap border-t border-[var(--border)]">{post}</p>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LineageTree({ lineage }: { lineage: Lineage }) {
  const [selected, setSelected] = useState<PromptNode | null>(null)
  const layout = useMemo(() => layoutLineage(lineage), [lineage])

  const totalW = (layout.width + 1) * COL + PAD_X * 2
  const totalH = (layout.height + 1) * ROW + PAD_Y * 2

  const nodeMap = useMemo(() => {
    const m = new Map<string, { node: PromptNode; cx: number; cy: number }>()
    for (const ln of layout.nodes) {
      m.set(ln.node.id, {
        node: ln.node,
        cx: PAD_X + ln.x * COL + NODE_W / 2,
        cy: PAD_Y + ln.y * ROW + NODE_H / 2,
      })
    }
    return m
  }, [layout])

  if (!lineage.prompts.length) {
    return (
      <div className="card text-center py-20 text-gray-600">
        <div className="text-4xl mb-3">🧬</div>
        <div>В этой ветке пока нет промптов — запусти эволюцию из /admin.</div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="overflow-auto card p-0" style={{ maxHeight: "75vh" }}>
        <svg width={totalW} height={totalH} className="block">
          {/* Generation row dividers */}
          {Array.from({ length: layout.height + 1 }, (_, g) => (
            <g key={g}>
              <line
                x1={0} x2={totalW}
                y1={PAD_Y + g * ROW + NODE_H + 12}
                y2={PAD_Y + g * ROW + NODE_H + 12}
                stroke="var(--border-faint)" strokeDasharray="4 4"
              />
              <text
                x={6} y={PAD_Y + g * ROW + 14}
                fill="var(--text-faint)" fontSize={10} fontFamily="monospace"
              >
                gen {g}
              </text>
            </g>
          ))}

          {/* Edges with operator color */}
          {layout.edges.map(e => {
            const a = nodeMap.get(e.from); const b = nodeMap.get(e.to)
            if (!a || !b) return null
            const meta = OPERATOR_META[e.op] ?? { color: "#3a3d4e", label: e.op, icon: "•" }
            const midY = (a.cy + NODE_H / 2 + b.cy - NODE_H / 2) / 2
            const d = `M ${a.cx} ${a.cy + NODE_H / 2} L ${a.cx} ${midY} L ${b.cx} ${midY} L ${b.cx} ${b.cy - NODE_H / 2}`
            return (
              <g key={`${e.from}-${e.to}`}>
                <path d={d} stroke={meta.color} strokeWidth={1.5} fill="none" opacity={0.6} />
                <text
                  x={(a.cx + b.cx) / 2} y={midY - 4}
                  textAnchor="middle" fill={meta.color} fontSize={10}
                  style={{ pointerEvents: "none" }}
                >
                  {meta.icon} {meta.label}
                </text>
              </g>
            )
          })}

          {/* Nodes */}
          {layout.nodes.map(ln => {
            const p = ln.node
            const cx = PAD_X + ln.x * COL + NODE_W / 2
            const cy = PAD_Y + ln.y * ROW + NODE_H / 2
            const isSelected = selected?.id === p.id
            const meta = OPERATOR_META[p.mutation_op] ?? { color: "#888", label: p.mutation_op, icon: "•" }
            const fit = p.fitness.avg_score
            const opacity = p.fitness.n_evals ? 1 : 0.55
            const stroke = isSelected ? "#a5b4fc" : p.is_pareto ? "#fbbf24" : "#2a2d3e"
            const strokeW = isSelected ? 2.5 : p.is_pareto ? 2 : 1
            return (
              <g
                key={p.id}
                transform={`translate(${cx - NODE_W / 2}, ${cy - NODE_H / 2})`}
                style={{ cursor: "pointer", opacity }}
                onClick={() => setSelected(p)}
              >
                <rect width={NODE_W} height={NODE_H} rx={10}
                      fill="var(--panel)" stroke={stroke} strokeWidth={strokeW} />
                <rect x={0} y={0} width={4} height={NODE_H} rx={2} fill={meta.color} />
                <text x={14} y={18} fill="var(--text-primary)" fontSize={11} fontFamily="ui-monospace, monospace">{p.id}</text>
                <text x={NODE_W - 10} y={18} textAnchor="end" fill={meta.color} fontSize={10}>
                  {meta.icon} {meta.label}
                </text>
                <text x={14} y={36} fill="var(--text-secondary)" fontSize={10}>
                  {p.text.slice(0, 38)}{p.text.length > 38 ? "…" : ""}
                </text>
                {p.fitness.n_evals > 0 && (
                  <>
                    <rect x={14} y={48} width={NODE_W - 28} height={4} rx={2} fill="var(--border)" />
                    <rect x={14} y={48} width={(NODE_W - 28) * Math.min(1, fit / 10)} height={4} rx={2}
                          fill={p.is_pareto ? "#fbbf24" : meta.color} />
                    <text x={14} y={68} fill="var(--text-muted)" fontSize={10} fontFamily="ui-monospace, monospace">
                      avg {fit.toFixed(2)} · {p.fitness.n_evals} eval
                    </text>
                    {p.is_pareto && (
                      <text x={NODE_W - 10} y={68} textAnchor="end" fill="#fbbf24" fontSize={10}>★ pareto</text>
                    )}
                  </>
                )}
                {!p.fitness.n_evals && (
                  <text x={14} y={66} fill="var(--text-faint)" fontSize={10}>ожидает оценки…</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        {Object.entries(OPERATOR_META).map(([op, m]) => (
          <span key={op} className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.icon} {m.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-amber-400 ml-auto">★ Pareto-граница</span>
      </div>

      {selected && <PromptDetailPanel p={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
