import { notFound } from "next/navigation"
import Link from "next/link"
import {
  loadTournaments,
  getModelHistory,
  getAllModels,
  slugToModel,
  modelSlug,
} from "@/lib/data"
import CriteriaRadar from "@/components/criteria-radar"
import type { CriteriaScores } from "@/lib/types"

export function generateStaticParams() {
  const tournaments = loadTournaments()
  return getAllModels(tournaments).map((m) => ({ slug: modelSlug(m) }))
}

function avgCriteria(
  history: ReturnType<typeof getModelHistory>
): CriteriaScores | null {
  const withCriteria = history.filter((h) => h.ranking.criteria)
  if (!withCriteria.length) return null
  const sum = { engagement: 0, informativeness: 0, accuracy: 0, originality: 0 }
  for (const h of withCriteria) {
    const c = h.ranking.criteria!
    sum.engagement += c.engagement
    sum.informativeness += c.informativeness
    sum.accuracy += c.accuracy
    sum.originality += c.originality
  }
  const n = withCriteria.length
  return {
    engagement: +(sum.engagement / n).toFixed(2),
    informativeness: +(sum.informativeness / n).toFixed(2),
    accuracy: +(sum.accuracy / n).toFixed(2),
    originality: +(sum.originality / n).toFixed(2),
  }
}

export default function ModelPage({ params }: { params: { slug: string } }) {
  const tournaments = loadTournaments()
  const allModels = getAllModels(tournaments)
  const model = slugToModel(params.slug, allModels)
  if (!model) notFound()

  const history = getModelHistory(tournaments, model)
  const criteria = avgCriteria(history)

  const totalW = history.reduce((s, h) => s + h.ranking.W, 0)
  const totalL = history.reduce((s, h) => s + h.ranking.L, 0)
  const totalD = history.reduce((s, h) => s + h.ranking.D, 0)
  const total = totalW + totalL + totalD
  const winRate = total ? ((totalW / total) * 100).toFixed(0) : "—"

  const bestRank = Math.min(...history.map((h) => h.ranking.rank))
  const avgRank = +(history.reduce((s, h) => s + h.ranking.rank, 0) / history.length).toFixed(1)

  // All posts this model wrote
  const posts = history
    .map((h) => ({
      post: h.tournament.posts[model],
      tournament: h.tournament,
      rank: h.ranking.rank,
    }))
    .filter((p) => p.post)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white break-all">{model}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {history.length} турниров · лучший ранг #{bestRank} · ср. ранг {avgRank}
        </p>
      </div>

      {/* Stats + radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Stats */}
        <div className="card space-y-4">
          <h2 className="text-base font-semibold">Общая статистика</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Турниров", value: history.length },
              { label: "Лучший ранг", value: `#${bestRank}` },
              { label: "Ср. ранг", value: avgRank },
              { label: "Winrate", value: `${winRate}%` },
            ].map((s) => (
              <div key={s.label} className="bg-[#13151f] rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-indigo-400">{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 text-sm">
            <span className="text-emerald-400 font-medium">{totalW}W</span>
            <span className="text-rose-400 font-medium">{totalL}L</span>
            <span className="text-gray-400 font-medium">{totalD}D</span>
          </div>
        </div>

        {/* Radar */}
        <div className="card">
          <h2 className="text-base font-semibold mb-2">Профиль качества</h2>
          {criteria ? (
            <CriteriaRadar criteria={criteria} />
          ) : (
            <p className="text-gray-500 text-sm py-8 text-center">
              Нет данных мультикритериального оценивания
            </p>
          )}
        </div>
      </div>

      {/* Tournament history */}
      <div className="card">
        <h2 className="text-base font-semibold mb-4">История турниров</h2>
        <table>
          <thead>
            <tr>
              <th>Турнир</th>
              <th>Дата</th>
              <th>Судья</th>
              <th>#</th>
              {history.some((h) => h.ranking.ts_score !== undefined) && <th>TS</th>}
              {history.some((h) => h.ranking.elo !== undefined) && <th>ELO</th>}
              <th>W/L/D</th>
              {history.some((h) => h.ranking.criteria) && (
                <><th>E</th><th>I</th><th>A</th><th>O</th></>
              )}
            </tr>
          </thead>
          <tbody>
            {history.map(({ tournament: t, ranking: r }) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/tournament/${t.id}`} className="text-indigo-300 hover:underline text-sm">
                    {t.format} {t.id.slice(-13)}
                  </Link>
                </td>
                <td className="text-gray-500 text-xs">
                  {new Date(t.run_at).toLocaleDateString("ru-RU")}
                </td>
                <td className="text-gray-400 text-xs">{t.judge.split(":")[0]}</td>
                <td className="font-mono">
                  {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`}
                </td>
                {history.some((h) => h.ranking.ts_score !== undefined) && (
                  <td className="font-mono text-indigo-300 text-sm">
                    {r.ts_score?.toFixed(1) ?? "—"}
                  </td>
                )}
                {history.some((h) => h.ranking.elo !== undefined) && (
                  <td className="font-mono text-sm">{r.elo?.toFixed(0) ?? "—"}</td>
                )}
                <td className="text-sm">
                  <span className="text-emerald-400">{r.W}</span>/
                  <span className="text-rose-400">{r.L}</span>/
                  <span className="text-gray-400">{r.D}</span>
                </td>
                {history.some((h) => h.ranking.criteria) &&
                  (["engagement", "informativeness", "accuracy", "originality"] as const).map(
                    (c) => (
                      <td key={c} className="font-mono text-xs text-gray-400">
                        {r.criteria?.[c]?.toFixed(1) ?? "—"}
                      </td>
                    )
                  )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Posts */}
      {posts.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-4">Написанные посты</h2>
          <div className="space-y-4">
            {posts.map(({ post, tournament, rank }) => (
              <details key={tournament.id} className="card">
                <summary className="cursor-pointer flex items-center gap-3">
                  <span className="font-medium text-sm">
                    {rank === 1 ? "🥇" : rank <= 3 ? "🥈" : "#" + rank}
                    {" "}в{" "}
                    <span className="text-indigo-300 underline">
                      <Link href={`/tournament/${tournament.id}`}>
                        {tournament.format} {tournament.id.slice(-13)}
                      </Link>
                    </span>
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(tournament.run_at).toLocaleDateString("ru-RU")}
                  </span>
                </summary>
                <div className="mt-4 pt-4 border-t border-[#2a2d3e]">
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                    {post}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
