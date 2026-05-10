"use client"
import { useState } from "react"
import type { MatchLog } from "@/lib/types"

const CRITERIA_LABELS = {
  engagement: "Eng",
  informativeness: "Inf",
  accuracy: "Acc",
  originality: "Ori",
} as const

function CriteriaChips({
  scores,
  side,
}: {
  scores: Record<string, number>
  side: "A" | "B"
}) {
  const color = side === "A" ? "bg-blue-600/20 text-blue-300" : "bg-purple-600/20 text-purple-300"
  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(CRITERIA_LABELS).map(([k, label]) => (
        <span key={k} className={`badge ${color}`}>
          {label} {scores[k] ?? "?"}
        </span>
      ))}
      <span className="badge bg-[#2a2d3e] text-gray-300 font-mono">
        Σ {Object.values(scores).reduce((a, b) => a + b, 0)}
      </span>
    </div>
  )
}

function MatchCard({ match }: { match: MatchLog }) {
  const [open, setOpen] = useState(false)
  const verdictColor =
    match.verdict === "A"
      ? "text-blue-400"
      : match.verdict === "B"
      ? "text-purple-400"
      : "text-gray-400"

  return (
    <div className="border border-[#2a2d3e] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-3 hover:bg-[#1e2130] transition-colors flex items-center gap-3"
      >
        <span className="text-gray-500 font-mono text-xs w-8">#{match.match}</span>
        <span className="text-blue-300 text-sm flex-1 truncate">{match.A.split(":")[0]}</span>
        <span className="text-gray-500 text-xs px-2">vs</span>
        <span className="text-purple-300 text-sm flex-1 truncate">{match.B.split(":")[0]}</span>
        <span className={`font-bold text-sm ${verdictColor} w-12 text-center`}>
          {match.verdict}
        </span>
        <span className="text-gray-600 text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[#2a2d3e] px-4 py-4 space-y-4 bg-[#13151f]">
          {/* Scores side by side */}
          {match.scores_a && match.scores_b && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Пост A · {match.A.split(":")[0]}</div>
                <CriteriaChips scores={match.scores_a} side="A" />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Пост B · {match.B.split(":")[0]}</div>
                <CriteriaChips scores={match.scores_b} side="B" />
              </div>
            </div>
          )}

          {/* TrueSkill delta */}
          {match.ts_a !== undefined && (
            <div className="flex gap-6 text-xs text-gray-500">
              <span>TS после: A={match.ts_a} B={match.ts_b}</span>
            </div>
          )}

          {/* Reasoning */}
          {match.reasoning && match.reasoning !== "нет ответа" && (
            <div className="bg-[#0f1117] rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">Мотивация судьи</div>
              <p className="text-gray-300 text-sm leading-relaxed">{match.reasoning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MatchLogView({ log }: { log: MatchLog[] }) {
  const rounds = Array.from(new Set(log.map((m) => m.round))).sort((a, b) => a - b)

  return (
    <div className="space-y-6">
      {rounds.map((rnd) => {
        const matches = log.filter((m) => m.round === rnd)
        return (
          <div key={rnd}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm font-semibold text-gray-300">Раунд {rnd}</span>
              <span className="text-xs text-gray-600">{matches.length} матчей</span>
              <div className="flex-1 h-px bg-[#2a2d3e]" />
            </div>
            <div className="space-y-2">
              {matches.map((m) => (
                <MatchCard key={m.match} match={m} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
