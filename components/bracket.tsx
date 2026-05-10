"use client"
import { useState } from "react"
import type { MatchLog, TournamentRanking } from "@/lib/types"

interface BracketProps {
  log: MatchLog[]
  posts: Record<string, string>
  ranking: TournamentRanking[]
}

interface MatchDetailProps {
  match: MatchLog
  posts: Record<string, string>
  onClose: () => void
}

const CRITERIA_LABELS: Record<string, string> = {
  engagement: "Вовлечённость",
  informativeness: "Информативность",
  accuracy: "Точность",
  originality: "Оригинальность",
}

function shortName(model: string) {
  return model.split(":")[0].split("/").pop() ?? model
}

function MatchDetail({ match, posts, onClose }: MatchDetailProps) {
  const [tab, setTab] = useState<"posts" | "scores">("posts")
  const postA = posts[match.A] ?? "Пост недоступен"
  const postB = posts[match.B] ?? "Пост недоступен"

  const totalA = match.scores_a ? Object.values(match.scores_a).reduce((a, b) => a + b, 0) : null
  const totalB = match.scores_b ? Object.values(match.scores_b).reduce((a, b) => a + b, 0) : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1d27] border border-[#2a2d3e] rounded-2xl w-full max-w-5xl my-8 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2d3e]">
          <div className="flex items-center gap-3">
            <span className="badge bg-[#2a2d3e] text-gray-400 text-xs">Раунд {match.round} · Матч #{match.match}</span>
            <span className={`font-bold text-sm px-3 py-1 rounded-full ${
              match.verdict === "A" ? "bg-blue-600/20 text-blue-300" :
              match.verdict === "B" ? "bg-purple-600/20 text-purple-300" :
              "bg-gray-600/20 text-gray-300"
            }`}>
              {match.verdict === "DRAW" ? "Ничья" : `Победил Пост ${match.verdict}`}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">✕</button>
        </div>

        {/* Models */}
        <div className="grid grid-cols-2 gap-0 border-b border-[#2a2d3e]">
          {([["A", match.A, "blue"], ["B", match.B, "purple"]] as const).map(([side, model, color]) => (
            <div key={side} className={`px-6 py-3 flex items-center gap-2 ${
              side === "A" ? "border-r border-[#2a2d3e]" : ""
            } ${match.verdict === side ? "bg-" + color + "-950/30" : ""}`}>
              <span className={`badge bg-${color}-600/20 text-${color}-300 font-bold`}>Пост {side}</span>
              <span className="text-gray-300 text-sm font-medium">{shortName(model)}</span>
              {match.verdict === side && <span className="text-xs text-emerald-400 ml-auto">✓ Победитель</span>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2d3e]">
          {(["posts", "scores"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-indigo-300 border-b-2 border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "posts" ? "Посты" : "Оценки судьи"}
            </button>
          ))}
        </div>

        {tab === "posts" && (
          <div className="grid grid-cols-2 gap-0 min-h-64">
            {([["A", postA, "blue"], ["B", postB, "purple"]] as const).map(([side, post, color]) => (
              <div key={side} className={`px-6 py-5 ${side === "A" ? "border-r border-[#2a2d3e]" : ""} ${
                match.verdict === side ? "bg-" + color + "-950/10" : ""
              }`}>
                <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{post}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "scores" && (
          <div className="px-6 py-5 space-y-5">
            {/* Reasoning */}
            {match.reasoning && match.reasoning !== "нет ответа" && (
              <div className="bg-[#13151f] rounded-xl p-4">
                <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Мотивация судьи</div>
                <p className="text-gray-300 text-sm leading-relaxed">{match.reasoning}</p>
              </div>
            )}

            {/* Criteria comparison */}
            {match.scores_a && match.scores_b && (
              <div className="space-y-3">
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Оценки по критериям</div>
                {Object.entries(CRITERIA_LABELS).map(([key, label]) => {
                  const a = (match.scores_a as Record<string, number>)[key] ?? 0
                  const b = (match.scores_b as Record<string, number>)[key] ?? 0
                  const winner = a > b ? "A" : b > a ? "B" : "="
                  return (
                    <div key={key} className="grid grid-cols-[1fr_80px_1fr] gap-3 items-center">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-blue-300 font-bold text-lg">{a}</span>
                        <div className="h-2 bg-blue-600/30 rounded-full overflow-hidden w-24 flex justify-end">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(a / 5) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-400">{label}</div>
                        <div className={`text-xs font-bold mt-0.5 ${
                          winner === "A" ? "text-blue-400" : winner === "B" ? "text-purple-400" : "text-gray-500"
                        }`}>
                          {winner === "=" ? "=" : `${winner}  ▶`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 bg-purple-600/30 rounded-full overflow-hidden w-24">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(b / 5) * 100}%` }} />
                        </div>
                        <span className="text-purple-300 font-bold text-lg">{b}</span>
                      </div>
                    </div>
                  )
                })}
                <div className="grid grid-cols-[1fr_80px_1fr] gap-3 items-center pt-2 border-t border-[#2a2d3e]">
                  <div className="text-right">
                    <span className={`text-xl font-bold ${match.verdict === "A" ? "text-blue-300" : "text-gray-400"}`}>
                      {totalA}
                    </span>
                  </div>
                  <div className="text-center text-xs text-gray-500">Итого</div>
                  <div>
                    <span className={`text-xl font-bold ${match.verdict === "B" ? "text-purple-300" : "text-gray-400"}`}>
                      {totalB}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function VerdictBadge({ verdict }: { verdict: string }) {
  if (verdict === "A") return <span className="text-blue-400 font-bold text-xs">A ▶</span>
  if (verdict === "B") return <span className="text-purple-400 font-bold text-xs">◀ B</span>
  return <span className="text-gray-500 text-xs">=</span>
}

export default function TournamentBracket({ log, posts, ranking }: BracketProps) {
  const [selected, setSelected] = useState<MatchLog | null>(null)

  const rounds = Array.from(new Set(log.map((m) => m.round))).sort((a, b) => a - b)

  // Build rank map for coloring
  const rankMap = Object.fromEntries(ranking.map((r) => [r.model, r.rank]))
  const topModels = new Set(ranking.slice(0, 3).map((r) => r.model))

  return (
    <div>
      {/* Round columns — horizontal scroll on mobile */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {rounds.map((rnd) => {
            const matches = log.filter((m) => m.round === rnd)
            return (
              <div key={rnd} className="w-72 shrink-0">
                <div className="text-center mb-3">
                  <span className="badge bg-indigo-600/20 text-indigo-300 text-sm font-semibold px-4 py-1">
                    Раунд {rnd}
                  </span>
                  <div className="text-gray-600 text-xs mt-1">{matches.length} матчей</div>
                </div>

                <div className="space-y-2">
                  {matches.map((m) => {
                    const aWon = m.verdict === "A"
                    const bWon = m.verdict === "B"
                    return (
                      <button
                        key={m.match}
                        onClick={() => setSelected(m)}
                        className="w-full text-left card hover:border-indigo-500/50 hover:bg-[#1e2130] transition-all p-3 group"
                      >
                        {/* Model A */}
                        <div className={`flex items-center gap-2 mb-1.5 ${aWon ? "opacity-100" : "opacity-50"}`}>
                          <span className={`w-5 h-5 rounded text-xs flex items-center justify-center font-bold shrink-0 ${
                            aWon ? "bg-blue-600 text-white" : "bg-[#2a2d3e] text-gray-500"
                          }`}>A</span>
                          <span className={`text-sm font-medium truncate flex-1 ${
                            topModels.has(m.A) ? "text-amber-300" : "text-gray-300"
                          }`}>
                            {shortName(m.A)}
                          </span>
                          {m.scores_a && (
                            <span className="text-xs text-gray-500 font-mono shrink-0">
                              {Object.values(m.scores_a as Record<string, number>).reduce((a, b) => a + b, 0)}
                            </span>
                          )}
                        </div>

                        {/* VS line */}
                        <div className="flex items-center gap-2 my-1.5">
                          <div className="flex-1 h-px bg-[#2a2d3e]" />
                          <VerdictBadge verdict={m.verdict} />
                          <div className="flex-1 h-px bg-[#2a2d3e]" />
                        </div>

                        {/* Model B */}
                        <div className={`flex items-center gap-2 mt-1.5 ${bWon ? "opacity-100" : "opacity-50"}`}>
                          <span className={`w-5 h-5 rounded text-xs flex items-center justify-center font-bold shrink-0 ${
                            bWon ? "bg-purple-600 text-white" : "bg-[#2a2d3e] text-gray-500"
                          }`}>B</span>
                          <span className={`text-sm font-medium truncate flex-1 ${
                            topModels.has(m.B) ? "text-amber-300" : "text-gray-300"
                          }`}>
                            {shortName(m.B)}
                          </span>
                          {m.scores_b && (
                            <span className="text-xs text-gray-500 font-mono shrink-0">
                              {Object.values(m.scores_b as Record<string, number>).reduce((a, b) => a + b, 0)}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-indigo-400/0 group-hover:text-indigo-400/60 text-center mt-2 transition-colors">
                          нажми для деталей →
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <MatchDetail
          match={selected}
          posts={posts}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
