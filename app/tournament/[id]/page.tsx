import { notFound } from "next/navigation"
import Link from "next/link"
import { getTournament, loadTournaments, modelSlug } from "@/lib/data"
import MatchLogView from "@/components/match-log"

export function generateStaticParams() {
  return loadTournaments().map((t) => ({ id: t.id }))
}

function PostModal({ posts, winner, rewrite, critique }: {
  posts: Record<string, string>
  winner: string
  rewrite?: string
  critique?: string
}) {
  return (
    <div className="space-y-4">
      {rewrite && (
        <div className="card border-indigo-600/40">
          <div className="flex items-center gap-2 mb-3">
            <span className="badge bg-indigo-600/20 text-indigo-300">✨ Улучшенный пост</span>
            <span className="text-gray-500 text-xs">{winner}</span>
          </div>
          <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">{rewrite}</p>
        </div>
      )}
      {critique && (
        <details className="card border-amber-600/20">
          <summary className="cursor-pointer text-amber-300 text-sm font-medium">
            Самокритика победителя
          </summary>
          <p className="text-gray-300 text-sm mt-3 whitespace-pre-wrap leading-relaxed">{critique}</p>
        </details>
      )}
    </div>
  )
}

export default function TournamentPage({ params }: { params: { id: string } }) {
  const t = getTournament(params.id)
  if (!t) notFound()

  const winner = t.ranking[0]
  const date = new Date(t.run_at).toLocaleString("ru-RU")

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          <span className={`badge ${
            t.format === "swiss" || t.format === "iter"
              ? "bg-indigo-600/20 text-indigo-300"
              : "bg-amber-600/20 text-amber-300"
          }`}>{t.format}</span>
          <span className="badge bg-[#2a2d3e] text-gray-300">судья: {t.judge}</span>
          <span className="badge bg-[#2a2d3e] text-gray-400">промпт v{t.prompt_version}</span>
          <span className="text-gray-500 text-sm">{date}</span>
        </div>
        <h1 className="text-xl font-bold text-white mt-2">Турнир #{t.id.slice(-20)}</h1>
        <p className="text-gray-400 text-sm mt-1 max-w-3xl">{t.task?.trim() ?? ""}</p>
        {t.evolved_task && (
          <details className="mt-2">
            <summary className="text-indigo-400 text-sm cursor-pointer">Эволюция промпта →</summary>
            <p className="text-gray-400 text-sm mt-2 pl-4 border-l border-indigo-800 max-w-3xl">
              {t.evolved_task?.trim() ?? ""}
            </p>
          </details>
        )}
      </div>

      {/* Rankings */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">
          Итоговый рейтинг
          <span className="text-gray-500 font-normal text-sm ml-2">
            {t.ranking.length} участников · {t.match_log.length} матчей
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th className="w-8">#</th>
                <th>Модель</th>
                {t.ranking[0]?.ts_score !== undefined ? (
                  <>
                    <th>TS</th><th>μ</th><th>σ</th>
                  </>
                ) : (
                  <th>ELO</th>
                )}
                <th>W</th><th>L</th><th>D</th>
                {t.ranking[0]?.criteria && (
                  <><th>Eng</th><th>Inf</th><th>Acc</th><th>Ori</th></>
                )}
              </tr>
            </thead>
            <tbody>
              {t.ranking.map((r) => {
                const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : ""
                return (
                  <tr key={r.model}>
                    <td className="font-mono text-gray-500 text-center">{medal || r.rank}</td>
                    <td>
                      <Link
                        href={`/model/${modelSlug(r.model)}`}
                        className="text-indigo-300 hover:underline"
                      >
                        {r.model}
                      </Link>
                      {r.model === t.judge && (
                        <span className="badge bg-amber-600/20 text-amber-300 ml-2 text-xs">судья</span>
                      )}
                    </td>
                    {r.ts_score !== undefined ? (
                      <>
                        <td className="font-mono text-indigo-300">{r.ts_score.toFixed(1)}</td>
                        <td className="font-mono text-gray-400">{r.mu?.toFixed(1)}</td>
                        <td className="font-mono text-gray-500">{r.sigma?.toFixed(2)}</td>
                      </>
                    ) : (
                      <td className="font-mono">{r.elo?.toFixed(0) ?? "—"}</td>
                    )}
                    <td className="text-emerald-400">{r.W}</td>
                    <td className="text-rose-400">{r.L}</td>
                    <td className="text-gray-400">{r.D}</td>
                    {r.criteria && (
                      <>
                        {(["engagement", "informativeness", "accuracy", "originality"] as const).map(
                          (c) => (
                            <td key={c} className="font-mono text-sm text-gray-300">
                              {r.criteria![c].toFixed(1)}
                            </td>
                          )
                        )}
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Winner's post + critique */}
      {winner && t.posts[winner.model] && (
        <div>
          <h2 className="text-lg font-semibold mb-4">Пост победителя · {winner.model}</h2>
          <PostModal
            posts={t.posts}
            winner={winner.model}
            rewrite={t.winner_rewrite}
            critique={t.winner_critique}
          />
          {!t.winner_rewrite && (
            <div className="card mt-4">
              <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
                {t.posts[winner.model]}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Reasoning summary */}
      {t.reasoning_summary && t.reasoning_summary !== "Недостаточно данных." && (
        <div className="card border-emerald-800/30">
          <h2 className="text-lg font-semibold mb-3">Паттерны судьи</h2>
          <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
            {t.reasoning_summary}
          </p>
        </div>
      )}

      {/* Match log */}
      <div>
        <h2 className="text-lg font-semibold mb-4">
          Матчи
          <span className="text-gray-500 font-normal text-sm ml-2">
            нажми на строку для деталей
          </span>
        </h2>
        <MatchLogView log={t.match_log} />
      </div>
    </div>
  )
}
