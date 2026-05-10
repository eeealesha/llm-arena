import { notFound } from "next/navigation"
import Link from "next/link"
import { getTournament, loadTournaments, modelSlug } from "@/lib/data"
import TournamentBracket from "@/components/bracket"
import TournamentNav from "@/components/tournament-nav"
import PromptDiff from "@/components/prompt-diff"
import ShareButton from "@/components/share-button"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const t = getTournament(params.id)
  if (!t) return {}
  const winner = t.ranking[0]?.model ?? ""
  const winnerShort = winner.split(":")[0].split("/").pop() ?? winner
  const title = `Турнир ${new Date(t.run_at).toLocaleDateString("ru-RU")} — ${winnerShort}`
  const description = t.task.slice(0, 160)
  const ogUrl = `/api/og?kind=tournament&title=${encodeURIComponent(t.task.slice(0, 90))}&subtitle=${encodeURIComponent(`Судья: ${t.judge.split(":")[0]} · ${t.ranking.length} участников`)}&winner=${encodeURIComponent(winnerShort)}`
  return {
    title,
    description,
    openGraph: {
      title: `LLM Arena — ${t.task.slice(0, 60)}`,
      description,
      type: "article",
      images: [ogUrl],
    },
    twitter: { card: "summary_large_image", images: [ogUrl] },
  }
}

export default function TournamentPage({ params }: { params: { id: string } }) {
  const t = getTournament(params.id)
  if (!t) notFound()

  const winner = t.ranking[0]
  const date = new Date(t.run_at).toLocaleString("ru-RU", {
    day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })

  // Determine which sections exist
  const hasBracket = t.match_log.length > 0
  const hasWinner = !!(winner && t.posts[winner.model])
  const hasPatterns = !!(t.reasoning_summary && t.reasoning_summary !== "Недостаточно данных.")
  const available = [
    "overview",
    "rankings",
    hasBracket && "bracket",
    hasWinner && "winner",
    hasPatterns && "patterns",
  ].filter(Boolean) as string[]

  const score = winner?.ts_score ?? winner?.elo

  return (
    <div className="space-y-0">
      <TournamentNav available={available} />

      {/* ── OVERVIEW ───────────────────────────────────────────── */}
      <section id="overview" className="scroll-mt-28 pb-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
          <Link href="/tournaments" className="hover:text-gray-300 transition-colors">Турниры</Link>
          <span>/</span>
          <span className="text-gray-400">{t.id.slice(-20)}</span>
        </div>

        {/* Title row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <span className={`badge ${
                t.format === "swiss" || t.format === "iter"
                  ? "bg-indigo-600/20 text-indigo-300"
                  : "bg-amber-600/20 text-amber-300"
              }`}>{t.format}</span>
              <span className="badge bg-[#2a2d3e] text-gray-300">
                судья: {t.judge.split(":")[0].split("/").pop()}
              </span>
              <span className="badge bg-[#2a2d3e] text-gray-400">промпт v{t.prompt_version}</span>
              <span className="text-gray-500 text-xs self-center">{date}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">
                Турнир <span className="text-gray-500 font-mono text-base">#{t.id.slice(-16)}</span>
              </h1>
              <ShareButton
                title={`LLM Arena — ${t.task.slice(0, 60)}`}
                text={`Турнир от ${new Date(t.run_at).toLocaleDateString("ru-RU")}. Победитель: ${t.ranking[0]?.model ?? "—"}`}
                path={`/tournament/${t.id}`}
              />
            </div>
          </div>
          {/* Quick stats */}
          <div className="flex gap-3 shrink-0">
            {[
              { v: t.ranking.length, l: "участников" },
              { v: t.match_log.length, l: "матчей" },
              { v: Array.from(new Set(t.match_log.map((m) => m.round))).length, l: "раундов" },
            ].map((s) => (
              <div key={s.l} className="text-center">
                <div className="text-lg font-bold text-indigo-400">{s.v}</div>
                <div className="text-xs text-gray-500">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Task — collapsible */}
        <details className="mt-4 group" open>
          <summary className="cursor-pointer flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors list-none">
            <span className="w-4 h-4 rounded bg-[#2a2d3e] flex items-center justify-center text-xs text-gray-500 group-open:rotate-90 transition-transform">›</span>
            Задание турнира {t.evolved_task && t.evolved_task !== t.task && <span className="text-indigo-400/70">· эволюция</span>}
          </summary>
          <div className="mt-3 pl-6 space-y-3 max-w-3xl">
            {t.evolved_task && t.evolved_task !== t.task ? (
              <PromptDiff original={t.task ?? ""} evolved={t.evolved_task} />
            ) : (
              <p className="text-gray-300 text-sm leading-relaxed bg-[#13151f] border border-[#2a2d3e] rounded-xl p-4 whitespace-pre-wrap">
                {t.task?.trim() ?? "—"}
              </p>
            )}
          </div>
        </details>
      </section>

      {/* ── RANKINGS ───────────────────────────────────────────── */}
      <section id="rankings" className="scroll-mt-28 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold text-white">Итоговый рейтинг</h2>
          <span className="text-gray-500 text-sm">{t.ranking.length} участников</span>
        </div>

        {/* Podium — top 3 */}
        <div className="grid grid-cols-3 gap-3 mb-5 max-w-xl">
          {t.ranking.slice(0, 3).map((r) => {
            const medal = r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"
            const s = r.ts_score ?? r.elo
            return (
              <Link
                key={r.model}
                href={`/model/${modelSlug(r.model)}`}
                className={`card text-center hover:border-indigo-500/50 transition-colors ${
                  r.rank === 1 ? "border-amber-600/30 bg-amber-950/10" : ""
                }`}
              >
                <div className="text-2xl mb-1">{medal}</div>
                <div className="text-xs font-medium text-gray-200 truncate" title={r.model}>
                  {r.model.split(":")[0].split("/").pop()}
                </div>
                {s !== undefined && (
                  <div className="text-xs font-mono text-indigo-300 mt-1">{s.toFixed(1)}</div>
                )}
                <div className="text-xs text-gray-500 mt-0.5">{r.W}W · {r.L}L</div>
              </Link>
            )
          })}
        </div>

        {/* Full table — collapsible */}
        <details>
          <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-2 list-none">
            <span className="w-4 h-4 rounded bg-[#2a2d3e] flex items-center justify-center text-xs text-gray-500">›</span>
            Полная таблица ({t.ranking.length} строк)
          </summary>
          <div className="mt-4 card overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>Модель</th>
                  {t.ranking[0]?.ts_score !== undefined ? (
                    <><th>TS</th><th>μ</th><th>σ</th></>
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
                        <Link href={`/model/${modelSlug(r.model)}`} className="text-indigo-300 hover:underline">
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
                        (["engagement", "informativeness", "accuracy", "originality"] as const).map((c) => (
                          <td key={c} className="font-mono text-sm text-gray-300">{r.criteria![c].toFixed(1)}</td>
                        ))
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      {/* ── BRACKET ────────────────────────────────────────────── */}
      {hasBracket && (
        <section id="bracket" className="scroll-mt-28 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Сетка турнира</h2>
          </div>
          <TournamentBracket
            log={t.match_log}
            posts={t.posts}
            ranking={t.ranking}
            roundComments={t.round_comments}
          />
        </section>
      )}

      {/* ── WINNER ─────────────────────────────────────────────── */}
      {hasWinner && (
        <section id="winner" className="scroll-mt-28 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Пост победителя</h2>
            <span className="text-indigo-300 text-sm">{winner.model}</span>
            {score !== undefined && (
              <span className="badge bg-amber-600/20 text-amber-300 font-mono text-xs">
                TS {score.toFixed(1)}
              </span>
            )}
          </div>

          {/* Winner's final post (rewrite preferred) */}
          {t.winner_rewrite ? (
            <div className="space-y-3">
              <div className="card border-indigo-600/30">
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge bg-indigo-600/20 text-indigo-300">✨ Улучшенный пост</span>
                  <span className="text-gray-500 text-xs">{winner.model}</span>
                </div>
                <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">{t.winner_rewrite}</p>
              </div>
              {/* Original + critique collapsible */}
              <details className="card border-[#2a2d3e]">
                <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition-colors list-none flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-[#2a2d3e] flex items-center justify-center text-xs text-gray-500">›</span>
                  Оригинальный пост + самокритика
                </summary>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Оригинал</div>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{t.posts[winner.model]}</p>
                  </div>
                  {t.winner_critique && (
                    <div>
                      <div className="text-xs text-amber-400/70 uppercase tracking-wide mb-2">Самокритика</div>
                      <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-wrap">{t.winner_critique}</p>
                    </div>
                  )}
                </div>
              </details>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="card">
                <p className="text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">{t.posts[winner.model]}</p>
              </div>
              {t.winner_critique && (
                <details className="card border-amber-600/20">
                  <summary className="cursor-pointer text-amber-300 text-sm font-medium list-none flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-amber-900/30 flex items-center justify-center text-xs">›</span>
                    Самокритика победителя
                  </summary>
                  <p className="text-gray-300 text-sm mt-3 whitespace-pre-wrap leading-relaxed">{t.winner_critique}</p>
                </details>
              )}
            </div>
          )}

          {/* All posts — collapsible */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-300 transition-colors list-none flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-[#2a2d3e] flex items-center justify-center text-xs text-gray-500">›</span>
              Все посты участников ({Object.keys(t.posts).length})
            </summary>
            <div className="mt-4 space-y-3">
              {t.ranking.map((r) => {
                const post = t.posts[r.model]
                if (!post) return null
                return (
                  <details key={r.model} className="card border-[#2a2d3e]">
                    <summary className="cursor-pointer text-sm text-gray-400 hover:text-gray-200 transition-colors list-none flex items-center gap-2">
                      <span className="text-gray-600 font-mono text-xs w-5">#{r.rank}</span>
                      <span className="flex-1 font-medium">{r.model}</span>
                      {r.ts_score !== undefined && (
                        <span className="text-xs font-mono text-gray-500">TS {r.ts_score.toFixed(1)}</span>
                      )}
                    </summary>
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap mt-4">
                      {post}
                    </p>
                  </details>
                )
              })}
            </div>
          </details>
        </section>
      )}

      {/* ── PATTERNS ───────────────────────────────────────────── */}
      {hasPatterns && (
        <section id="patterns" className="scroll-mt-28 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-white">Паттерны судьи</h2>
            <span className="text-gray-500 text-sm">{t.judge.split(":")[0].split("/").pop()}</span>
          </div>
          <div className="card border-emerald-800/25">
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
              {t.reasoning_summary}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
