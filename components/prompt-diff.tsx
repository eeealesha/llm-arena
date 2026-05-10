"use client"
import { useMemo, useState } from "react"

type DiffOp = { type: "eq" | "ins" | "del"; text: string }

// Word-level LCS diff. Keeps surrounding whitespace inline.
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? []
}

function diffWords(a: string, b: string): DiffOp[] {
  const A = tokenize(a)
  const B = tokenize(b)
  const n = A.length, m = B.length
  // LCS table — capped for safety (very long prompts truncated)
  const MAX = 1500
  if (n > MAX || m > MAX) {
    return [{ type: "del", text: a }, { type: "ins", text: b }]
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffOp[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j])           { out.push({ type: "eq",  text: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: A[i] }); i++ }
    else                          { out.push({ type: "ins", text: B[j] }); j++ }
  }
  while (i < n) out.push({ type: "del", text: A[i++] })
  while (j < m) out.push({ type: "ins", text: B[j++] })
  // Coalesce consecutive ops of same type for compact rendering
  const merged: DiffOp[] = []
  for (const op of out) {
    const last = merged[merged.length - 1]
    if (last && last.type === op.type) last.text += op.text
    else merged.push({ ...op })
  }
  return merged
}

export default function PromptDiff({ original, evolved }: { original: string; evolved: string }) {
  const [view, setView] = useState<"diff" | "side" | "evolved">("diff")
  const ops = useMemo(() => diffWords(original.trim(), evolved.trim()), [original, evolved])

  const stats = useMemo(() => {
    let added = 0, removed = 0
    for (const op of ops) {
      const words = op.text.trim() ? op.text.trim().split(/\s+/).length : 0
      if (op.type === "ins") added   += words
      if (op.type === "del") removed += words
    }
    return { added, removed }
  }, [ops])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex p-0.5 rounded-lg bg-[#13151f] border border-[#2a2d3e]">
          {(["diff", "side", "evolved"] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                view === v ? "bg-indigo-600/30 text-indigo-300" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {v === "diff" ? "Diff" : v === "side" ? "Рядом" : "Только эволюция"}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 ml-2">
          <span className="text-emerald-400">+{stats.added}</span>{" "}
          <span className="text-rose-400">−{stats.removed}</span>
          <span className="text-gray-600"> слов</span>
        </span>
      </div>

      {view === "diff" && (
        <div className="bg-[#0a0c12] border border-[#2a2d3e] rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {ops.map((op, i) =>
            op.type === "eq" ? (
              <span key={i} className="text-gray-400">{op.text}</span>
            ) : op.type === "ins" ? (
              <span key={i} className="bg-emerald-900/40 text-emerald-200 rounded px-0.5">{op.text}</span>
            ) : (
              <span key={i} className="bg-rose-900/30 text-rose-300/70 line-through rounded px-0.5">{op.text}</span>
            )
          )}
        </div>
      )}

      {view === "side" && (
        <div className="grid md:grid-cols-2 gap-3">
          <div className="bg-[#0a0c12] border border-[#2a2d3e] rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Оригинал</div>
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{original.trim()}</p>
          </div>
          <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-indigo-400 mb-2">После эволюции</div>
            <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{evolved.trim()}</p>
          </div>
        </div>
      )}

      {view === "evolved" && (
        <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4">
          <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{evolved.trim()}</p>
        </div>
      )}
    </div>
  )
}
