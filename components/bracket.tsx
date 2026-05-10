"use client"
import { useState } from "react"
import type { MatchLog, TournamentRanking } from "@/lib/types"

interface BracketProps {
  log: MatchLog[]
  posts: Record<string, string>
  ranking: TournamentRanking[]
  roundComments?: Record<string, string>
}

const CRITERIA_LABELS: Record<string, string> = {
  engagement: "Вовлечённость",
  informativeness: "Информативность",
  accuracy: "Точность",
  originality: "Оригинальность",
}

function shortName(m: string) {
  return m.split(":")[0].split("/").pop() ?? m
}

function scoreTotal(s: Record<string, number> | undefined) {
  if (!s) return null
  return Object.values(s).reduce((a, b) => a + b, 0)
}

// ── Match detail modal ─────────────────────────────────────────────────────
function MatchModal({
  match,
  posts,
  onClose,
}: {
  match: MatchLog
  posts: Record<string, string>
  onClose: () => void
}) {
  const [tab, setTab] = useState<"posts" | "scores">("scores")
  const totalA = scoreTotal(match.scores_a as Record<string, number>)
  const totalB = scoreTotal(match.scores_b as Record<string, number>)
  const tsA = match.ts_a ?? match.elo_a
  const tsB = match.ts_b ?? match.elo_b

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 pt-16 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#13151f] border border-[#2a2d3e] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2d3e] bg-[#1a1d27]">
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-xs">Раунд {match.round} · Матч #{match.match}</span>
            {match.verdict !== "DRAW" ? (
              <span className="text-xs font-semibold text-emerald-400">
                Победа {match.verdict === "A" ? shortName(match.A) : shortName(match.B)}
              </span>
            ) : (
              <span className="text-xs text-gray-400">Ничья</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-[#2a2d3e] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Match header — both players */}
        <div className="grid grid-cols-2 border-b border-[#2a2d3e]">
          {(["A", "B"] as const).map((side) => {
            const model = side === "A" ? match.A : match.B
            const total = side === "A" ? totalA : totalB
            const ts = side === "A" ? tsA : tsB
            const won = match.verdict === side
            const lost = match.verdict !== "DRAW" && match.verdict !== side
            return (
              <div
                key={side}
                className={`px-5 py-4 flex items-center gap-3 ${side === "A" ? "border-r border-[#2a2d3e]" : ""} ${
                  won ? "bg-emerald-950/20" : lost ? "opacity-50" : ""
                }`}
              >
                <div
                  className={`w-1 h-10 rounded-full shrink-0 ${
                    won ? "bg-emerald-500" : lost ? "bg-[#2a2d3e]" : "bg-gray-600"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 mb-0.5">Пост {side}</div>
                  <div className={`font-semibold text-sm truncate ${won ? "text-white" : "text-gray-400"}`}>
                    {shortName(model)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {total !== null && (
                    <div className={`text-xl font-bold font-mono ${won ? "text-emerald-400" : "text-gray-500"}`}>
                      {total}
                      <span className="text-xs text-gray-600">/20</span>
                    </div>
                  )}
                  {ts !== undefined && (
                    <div className="text-xs text-gray-600 mt-0.5">TS {ts.toFixed(1)}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2d3e]">
          {(["scores", "posts"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                tab === t
                  ? "text-indigo-300 border-b-2 border-indigo-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {t === "scores" ? "Оценки судьи" : "Посты"}
            </button>
          ))}
        </div>

        {/* Scores tab */}
        {tab === "scores" && (
          <div className="px-5 py-5 space-y-5">
            {match.reasoning && match.reasoning !== "нет ответа" && (
              <div className="bg-[#0f1117] rounded-xl p-4 border border-[#2a2d3e]">
                <div className="text-xs text-amber-400/70 uppercase tracking-wide mb-2">Вердикт судьи</div>
                <p className="text-gray-300 text-sm leading-relaxed">{match.reasoning}</p>
              </div>
            )}
            {match.scores_a && match.scores_b && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-xs text-gray-500 text-center mb-1">
                  <div className="text-right pr-2">{shortName(match.A)}</div>
                  <div />
                  <div className="text-left pl-2">{shortName(match.B)}</div>
                </div>
                {Object.entries(CRITERIA_LABELS).map(([key, label]) => {
                  const a = (match.scores_a as Record<string, number>)[key] ?? 0
                  const b = (match.scores_b as Record<string, number>)[key] ?? 0
                  const aWins = a > b
                  const bWins = b > a
                  return (
                    <div key={key} className="grid grid-cols-[1fr_72px_1fr] gap-2 items-center">
                      {/* A side */}
                      <div className="flex items-center gap-2 justify-end">
                        <span className={`text-base font-bold font-mono ${aWins ? "text-emerald-400" : "text-gray-500"}`}>{a}</span>
                        <div className="w-20 h-1.5 bg-[#2a2d3e] rounded-full overflow-hidden flex justify-end">
                          <div
                            className={`h-full rounded-full ${aWins ? "bg-emerald-500" : "bg-gray-600"}`}
                            style={{ width: `${(a / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                      {/* Label */}
                      <div className="text-center text-xs text-gray-500 leading-tight">{label}</div>
                      {/* B side */}
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-[#2a2d3e] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${bWins ? "bg-indigo-500" : "bg-gray-600"}`}
                            style={{ width: `${(b / 5) * 100}%` }}
                          />
                        </div>
                        <span className={`text-base font-bold font-mono ${bWins ? "text-indigo-400" : "text-gray-500"}`}>{b}</span>
                      </div>
                    </div>
                  )
                })}
                {/* Totals */}
                <div className="grid grid-cols-[1fr_72px_1fr] gap-2 items-center pt-2 mt-1 border-t border-[#2a2d3e]">
                  <div className="text-right">
                    <span className={`text-xl font-bold font-mono ${match.verdict === "A" ? "text-emerald-400" : "text-gray-500"}`}>
                      {totalA}
                    </span>
                  </div>
                  <div className="text-center text-xs text-gray-500">Итого</div>
                  <div>
                    <span className={`text-xl font-bold font-mono ${match.verdict === "B" ? "text-indigo-400" : "text-gray-500"}`}>
                      {totalB}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Posts tab */}
        {tab === "posts" && (
          <div className="grid grid-cols-2 min-h-48 max-h-[60vh] overflow-y-auto divide-x divide-[#2a2d3e]">
            {(["A", "B"] as const).map((side) => {
              const model = side === "A" ? match.A : match.B
              const post = posts[model] ?? "Пост недоступен"
              const won = match.verdict === side
              return (
                <div key={side} className={`px-5 py-4 ${won ? "bg-emerald-950/10" : "bg-transparent"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-semibold ${won ? "text-emerald-400" : "text-gray-500"}`}>
                      Пост {side}
                    </span>
                    <span className="text-xs text-gray-600 truncate">{shortName(model)}</span>
                    {won && <span className="text-xs text-emerald-500 ml-auto">✓ Победитель</span>}
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{post}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Match card (lolesports style) ──────────────────────────────────────────
function MatchCard({
  match,
  topModels,
  onClick,
}: {
  match: MatchLog
  topModels: Set<string>
  onClick: () => void
}) {
  const totalA = scoreTotal(match.scores_a as Record<string, number>)
  const totalB = scoreTotal(match.scores_b as Record<string, number>)

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border border-[#2a2d3e] overflow-hidden hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-950/40 transition-all group bg-[#13151f]"
    >
      {/* Player A */}
      <TeamRow
        side="A"
        model={match.A}
        total={totalA}
        ts={match.ts_a ?? match.elo_a}
        verdict={match.verdict}
        isTop={topModels.has(match.A)}
      />
      {/* Thin divider */}
      <div className="h-px bg-[#2a2d3e] relative">
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-[#13151f] px-1.5 text-[10px] text-gray-600 group-hover:text-gray-500 transition-colors">
            vs
          </span>
        </div>
      </div>
      {/* Player B */}
      <TeamRow
        side="B"
        model={match.B}
        total={totalB}
        ts={match.ts_b ?? match.elo_b}
        verdict={match.verdict}
        isTop={topModels.has(match.B)}
      />
    </button>
  )
}

function TeamRow({
  side,
  model,
  total,
  ts,
  verdict,
  isTop,
}: {
  side: "A" | "B"
  model: string
  total: number | null
  ts: number | undefined
  verdict: string
  isTop: boolean
}) {
  const won = verdict === side
  const lost = verdict !== "DRAW" && verdict !== side

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 relative ${
        won
          ? "bg-emerald-950/25"
          : lost
          ? "opacity-50"
          : "bg-transparent"
      }`}
    >
      {/* Left accent bar */}
      <div
        className={`w-0.5 h-7 rounded-full shrink-0 ${
          won ? "bg-emerald-500" : lost ? "bg-[#2a2d3e]" : "bg-gray-700"
        }`}
      />
      {/* Model name */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm font-medium truncate block ${
            won ? "text-white" : lost ? "text-gray-500" : "text-gray-300"
          } ${isTop ? "text-amber-300" : ""}`}
        >
          {shortName(model)}
        </span>
        {ts !== undefined && (
          <span className="text-[10px] text-gray-600">TS {ts.toFixed(1)}</span>
        )}
      </div>
      {/* Score */}
      {total !== null && (
        <span
          className={`text-sm font-bold font-mono shrink-0 ${
            won ? "text-emerald-400" : "text-gray-600"
          }`}
        >
          {total}
        </span>
      )}
      {won && (
        <span className="text-emerald-500 text-xs shrink-0">✓</span>
      )}
    </div>
  )
}

// ── Round commentary card ─────────────────────────────────────────────────
function RoundComment({ comment }: { comment: string }) {
  const [open, setOpen] = useState(false)
  const preview = comment.slice(0, 120)
  return (
    <div className="mt-3 rounded-xl border border-[#2a2d3e] bg-[#0f1117] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-[#1a1d27] transition-colors text-left"
      >
        <span className="text-base shrink-0">🎙️</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-indigo-400 font-medium mb-0.5">Комментатор</div>
          <p className="text-gray-400 text-xs leading-relaxed">
            {open ? comment : preview + (comment.length > 120 ? "…" : "")}
          </p>
        </div>
        <span className="text-gray-600 text-xs shrink-0 mt-0.5">{open ? "↑" : "↓"}</span>
      </button>
    </div>
  )
}

// ── Main bracket ───────────────────────────────────────────────────────────
export default function TournamentBracket({ log, posts, ranking, roundComments }: BracketProps) {
  const [selected, setSelected] = useState<MatchLog | null>(null)

  const rounds = Array.from(new Set(log.map((m) => m.round))).sort((a, b) => a - b)
  const topModels = new Set(ranking.slice(0, 3).map((r) => r.model))

  // Standings snapshot after each round (cumulative W/L)
  const standingsAfter: Record<number, Record<string, { W: number; L: number; D: number }>> = {}
  const running: Record<string, { W: number; L: number; D: number }> = {}
  for (const m of ranking) {
    running[m.model] = { W: 0, L: 0, D: 0 }
  }
  for (const rnd of rounds) {
    const rndMatches = log.filter((m) => m.round === rnd)
    for (const m of rndMatches) {
      if (!running[m.A]) running[m.A] = { W: 0, L: 0, D: 0 }
      if (!running[m.B]) running[m.B] = { W: 0, L: 0, D: 0 }
      if (m.verdict === "A") { running[m.A].W++; running[m.B].L++ }
      else if (m.verdict === "B") { running[m.B].W++; running[m.A].L++ }
      else { running[m.A].D++; running[m.B].D++ }
    }
    standingsAfter[rnd] = JSON.parse(JSON.stringify(running))
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
          Победитель матча
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Топ-3 турнира
        </span>
        <span className="text-gray-600">· нажми карточку для деталей</span>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3 min-w-max">
          {rounds.map((rnd) => {
            const matches = log.filter((m) => m.round === rnd)
            const comment = roundComments?.[String(rnd)]
            return (
              <div key={rnd} className="w-64 shrink-0">
                {/* Round header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="flex-1 h-px bg-[#2a2d3e]" />
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest whitespace-nowrap">
                    Раунд {rnd}
                  </span>
                  <div className="flex-1 h-px bg-[#2a2d3e]" />
                </div>
                <div className="text-center text-[10px] text-gray-600 mb-3">
                  {matches.length} матчей
                </div>

                {/* Match cards */}
                <div className="space-y-2">
                  {matches.map((m) => (
                    <MatchCard
                      key={m.match}
                      match={m}
                      topModels={topModels}
                      onClick={() => setSelected(m)}
                    />
                  ))}
                </div>

                {/* Round commentary */}
                {comment && <RoundComment comment={comment} />}
              </div>
            )
          })}

          {/* Final standings column */}
          <div className="w-56 shrink-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className="flex-1 h-px bg-[#2a2d3e]" />
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest whitespace-nowrap">
                Итог
              </span>
              <div className="flex-1 h-px bg-[#2a2d3e]" />
            </div>
            <div className="text-center text-[10px] text-gray-600 mb-3">финальный рейтинг</div>
            <div className="space-y-1.5">
              {ranking.slice(0, 10).map((r) => {
                const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : null
                const score = r.ts_score ?? r.elo
                return (
                  <div
                    key={r.model}
                    className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
                      r.rank <= 3
                        ? "border-amber-600/30 bg-amber-950/15"
                        : "border-[#2a2d3e] bg-[#13151f]"
                    }`}
                  >
                    <span className="text-sm w-5 shrink-0 text-center">
                      {medal ?? <span className="text-gray-600 text-xs">{r.rank}</span>}
                    </span>
                    <span
                      className={`text-xs font-medium truncate flex-1 ${
                        r.rank <= 3 ? "text-amber-200" : "text-gray-400"
                      }`}
                    >
                      {shortName(r.model)}
                    </span>
                    {score !== undefined && (
                      <span className="text-xs font-mono text-gray-500 shrink-0">
                        {score.toFixed(1)}
                      </span>
                    )}
                  </div>
                )
              })}
              {ranking.length > 10 && (
                <div className="text-center text-xs text-gray-600 pt-1">
                  +{ranking.length - 10} ещё
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <MatchModal match={selected} posts={posts} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
