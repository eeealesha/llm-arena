export const dynamic = "force-dynamic"
import Link from "next/link"
import { loadTournaments, aggregateLeaderboard, computeLeaderboardDelta, modelSlug } from "@/lib/data"
import type { GlobalModelStats } from "@/lib/types"

function RankDelta({ delta }: { delta: number | "new" | undefined }) {
  if (delta === undefined) return null
  if (delta === "new") {
    return <span className="ml-1 text-[10px] font-medium text-amber-400 align-middle">new</span>
  }
  if (delta === 0) return null
  const up = delta > 0
  return (
    <span className={`ml-1 text-[10px] font-medium align-middle ${up ? "text-emerald-400" : "text-rose-400"}`}>
      {up ? "↑" : "↓"}{Math.abs(delta)}
    </span>
  )
}

function CriteriaBar({ value }: { value: number }) {
  const pct = (value / 5) * 100
  const color =
    value >= 4 ? "bg-emerald-500" : value >= 3 ? "bg-indigo-500" : "bg-amber-500"
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-[#2a2d3e] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400">{value.toFixed(1)}</span>
    </div>
  )
}

function WinRate({ w, l, d }: { w: number; l: number; d: number }) {
  const total = w + l + d
  if (!total) return <span className="text-gray-500">—</span>
  const pct = Math.round((w / total) * 100)
  return (
    <span className={pct >= 60 ? "text-emerald-400" : pct >= 40 ? "text-gray-300" : "text-rose-400"}>
      {pct}% <span className="text-gray-500 text-xs">({w}W/{l}L/{d}D)</span>
    </span>
  )
}

export default function DashboardPage() {
  const tournaments = loadTournaments()
  const leaderboard = aggregateLeaderboard(tournaments)
  const { rankDelta } = computeLeaderboardDelta(tournaments)

  const totalMatches = tournaments.reduce(
    (s, t) => s + (t.match_log?.length || 0), 0
  )
  const uniqueModels = leaderboard.length
  const uniqueJudges = new Set(tournaments.map((t) => t.judge)).size

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">LLM Arena</h1>
        <p className="text-gray-400 mt-1">
          Открытый бенчмарк бесплатных LLM — швейцарский турнир, мультикритериальное
          судейство, эволюция промптов
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Турниров", value: tournaments.length },
          { label: "Моделей", value: uniqueModels },
          { label: "Матчей", value: totalMatches },
          { label: "Судей", value: uniqueJudges },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-3xl font-bold text-indigo-400">{s.value}</div>
            <div className="text-sm text-gray-400 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Global leaderboard */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Общий лидерборд</h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Модель</th>
                <th>Турниры</th>
                <th>Ср. ранг</th>
                <th>Винрейт</th>
                <th>Engag.</th>
                <th>Inform.</th>
                <th>Accur.</th>
                <th>Orig.</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((m, i) => (
                <tr key={m.model}>
                  <td className="font-mono text-gray-500">{i + 1}</td>
                  <td>
                    <Link
                      href={`/model/${modelSlug(m.model)}`}
                      className="font-medium text-indigo-300 hover:text-indigo-200 hover:underline"
                    >
                      {m.model}
                    </Link>
                    <RankDelta delta={rankDelta[m.model]} />
                  </td>
                  <td className="text-gray-400">{m.tournaments}</td>
                  <td className="font-mono">{m.avg_rank.toFixed(1)}</td>
                  <td>
                    <WinRate w={m.wins} l={m.losses} d={m.draws} />
                  </td>
                  {(["engagement", "informativeness", "accuracy", "originality"] as const).map(
                    (c) => (
                      <td key={c}>
                        {m.criteria ? (
                          <CriteriaBar value={m.criteria[c]} />
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent tournaments */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Последние турниры</h2>
        <div className="grid gap-3">
          {tournaments.slice(0, 8).map((t) => {
            const winner = t.ranking[0]
            const date = new Date(t.run_at).toLocaleDateString("ru-RU", {
              day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
            })
            return (
              <Link
                key={t.id}
                href={`/tournament/${t.id}`}
                className="card hover:border-indigo-600/50 hover:bg-[#1e2130] transition-colors flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${
                      t.format === "swiss" || t.format === "iter"
                        ? "bg-indigo-600/20 text-indigo-300"
                        : "bg-amber-600/20 text-amber-300"
                    }`}>
                      {t.format}
                    </span>
                    <span className="badge bg-[#2a2d3e] text-gray-400">
                      судья: {t.judge.split(":")[0]}
                    </span>
                    <span className="badge bg-[#2a2d3e] text-gray-400">
                      v{t.prompt_version}
                    </span>
                    <span className="text-gray-500 text-xs">{date}</span>
                  </div>
                  <p className="text-gray-400 text-sm mt-1 truncate">{t.task.slice(0, 120)}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm text-gray-400">победитель</div>
                  <div className="text-indigo-300 font-medium text-sm">
                    {winner?.model?.split(":")[0] ?? "—"}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {t.ranking.length} уч. · {t.match_log.length} матчей
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
