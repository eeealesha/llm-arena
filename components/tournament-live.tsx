"use client"
import { useEffect, useRef, useState } from "react"

interface TsEntry { model: string; rank: number; ts: number; mu: number; sigma: number; W: number; L: number; D: number }
interface MatchEvent { round: number; match: number; A: string; B: string; verdict: string; reasoning: string; scores_a: Record<string, number>; scores_b: Record<string, number>; ts_a: number; ts_b: number }
interface RoundEnd { round: number; standings: TsEntry[]; comment: string | null }
interface PostEvent { model: string; words: number; time: number }

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }
function scoreTotal(s: Record<string, number> | undefined) {
  if (!s) return null
  return Object.values(s).reduce((a, b) => a + b, 0)
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
        {/* Team A */}
        <div className={`flex items-center gap-2 px-3 py-2.5 ${won_a ? "bg-emerald-950/30" : won_b ? "opacity-50" : ""}`}>
          <div className={`w-0.5 h-6 rounded-full ${won_a ? "bg-emerald-500" : "bg-[#2a2d3e]"}`} />
          <span className={won_a ? "text-white font-medium" : "text-gray-400"}>{shortName(m.A)}</span>
          {sa !== null && <span className={`ml-auto text-xs ${won_a ? "text-emerald-400" : "text-gray-600"}`}>{sa}/20</span>}
        </div>
        {/* Score / round */}
        <div className="flex flex-col items-center justify-center px-3 border-x border-[#2a2d3e] text-xs text-gray-500 bg-[#0f1117]">
          <span>М{m.match}</span>
          <span className={`font-bold mt-0.5 ${m.verdict === "DRAW" ? "text-amber-400" : "text-gray-300"}`}>
            {m.verdict === "DRAW" ? "=" : m.verdict}
          </span>
        </div>
        {/* Team B */}
        <div className={`flex items-center gap-2 px-3 py-2.5 flex-row-reverse ${won_b ? "bg-emerald-950/30" : won_a ? "opacity-50" : ""}`}>
          <div className={`w-0.5 h-6 rounded-full ${won_b ? "bg-emerald-500" : "bg-[#2a2d3e]"}`} />
          <span className={won_b ? "text-white font-medium" : "text-gray-400"}>{shortName(m.B)}</span>
          {sb !== null && <span className={`mr-auto text-xs ${won_b ? "text-emerald-400" : "text-gray-600"}`}>{sb}/20</span>}
        </div>
      </div>
      {open && (
        <div className="border-t border-[#2a2d3e] bg-[#0a0c12] px-4 py-3 space-y-2">
          <p className="text-gray-300 text-sm leading-relaxed">{m.reasoning}</p>
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div>
              {Object.entries(m.scores_a || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span>{k}</span><span className="text-gray-300">{v}</span></div>
              ))}
              <div className="flex justify-between border-t border-[#2a2d3e] mt-1 pt-1 text-gray-400 font-medium"><span>TS</span><span>{m.ts_a}</span></div>
            </div>
            <div>
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

function RoundSection({ rnd, matches, comment }: { rnd: number; matches: MatchEvent[]; comment: string | null }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Раунд {rnd}</div>
        <div className="flex-1 h-px bg-[#2a2d3e]" />
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

export default function TournamentLive() {
  const [status, setStatus]       = useState<string>("idle")
  const [posts, setPosts]         = useState<Record<string, number>>({})  // model → word count
  const [matches, setMatches]     = useState<MatchEvent[]>([])
  const [rounds, setRounds]       = useState<RoundEnd[]>([])
  const [standings, setStandings] = useState<TsEntry[]>([])
  const [statusMsg, setStatusMsg] = useState<string>("")
  const [config, setConfig]       = useState<{ contestants: string[]; rounds: number; judge: string } | null>(null)
  const [done, setDone]           = useState<{ winner: string; tournament_id: string } | null>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    // Check if something is running
    fetch("/api/runner/status").then(r => r.json()).then(s => {
      if (s.running) connect()
    }).catch(() => {})
  }, [])

  function connect() {
    if (esRef.current) esRef.current.close()
    const es = new EventSource("/api/runner/stream")
    esRef.current = es
    setStatus("running")

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data)
        handleEvent(evt)
      } catch { /* ignore parse errors */ }
    }
    es.onerror = () => {
      setStatus("disconnected")
      es.close()
    }
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case "config":
        setConfig({
          contestants: (evt.contestants as string[]) || [],
          rounds: 0,
          judge: (evt.judge as string) || "",
        })
        break
      case "tournament_start":
        setConfig(c => c ? { ...c, rounds: evt.rounds as number } : null)
        setStatus("running")
        break
      case "post_done":
        setPosts(p => ({ ...p, [evt.model as string]: evt.words as number }))
        break
      case "status":
        setStatusMsg(evt.message as string)
        break
      case "match":
        setMatches(ms => [...ms, evt as unknown as MatchEvent])
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
      case "done":
        setDone({ winner: evt.winner as string, tournament_id: evt.tournament_id as string })
        setStatus("done")
        break
      case "error":
        setStatusMsg(`Ошибка: ${evt.message}`)
        setStatus("error")
        break
      case "runner_end":
        if (status !== "done") setStatus("idle")
        break
    }
  }

  // Group matches by round
  const matchesByRound: Record<number, MatchEvent[]> = {}
  for (const m of matches) {
    (matchesByRound[m.round] = matchesByRound[m.round] || []).push(m)
  }

  const roundNums = Array.from(
    new Set([...Object.keys(matchesByRound).map(Number), ...rounds.map(r => r.round)])
  ).sort((a, b) => a - b)

  const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
        status === "running"  ? "border-indigo-700/50 bg-indigo-950/20 text-indigo-300" :
        status === "done"     ? "border-emerald-700/50 bg-emerald-950/20 text-emerald-300" :
        status === "error"    ? "border-rose-700/50 bg-rose-950/20 text-rose-300" :
        "border-[#2a2d3e] text-gray-500"
      }`}>
        {status === "running" && (
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        )}
        <span className="font-medium capitalize">
          {status === "running" ? "Идёт турнир" :
           status === "done"    ? "Завершён" :
           status === "idle"    ? "Ожидание" :
           status === "error"   ? "Ошибка" : status}
        </span>
        {statusMsg && <span className="text-gray-400 truncate">{statusMsg}</span>}
        {status === "running" && (
          <button
            onClick={() => fetch("/api/runner/cancel", { method: "POST" })}
            className="ml-auto text-rose-400 hover:text-rose-300 text-xs border border-rose-800/50 px-2 py-0.5 rounded transition-colors"
          >
            Остановить
          </button>
        )}
      </div>

      {/* Done banner */}
      {done && (
        <div className="card border-emerald-800/50 bg-emerald-950/20 text-center py-6">
          <div className="text-3xl mb-2">🏆</div>
          <div className="text-white font-bold text-lg">{shortName(done.winner)}</div>
          <div className="text-emerald-400 text-sm mt-1">Победитель турнира</div>
          <a href={`/tournament/${done.tournament_id}`}
             className="mt-4 inline-block px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors">
            Открыть результаты →
          </a>
        </div>
      )}

      {config && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div className="card text-center">
            <div className="text-2xl font-bold text-white">{config.contestants.length}</div>
            <div className="text-gray-500 text-xs mt-1">участников</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-white">{config.rounds || "—"}</div>
            <div className="text-gray-500 text-xs mt-1">раундов</div>
          </div>
          <div className="card text-center col-span-2 sm:col-span-1">
            <div className="text-sm font-medium text-indigo-300 truncate">{shortName(config.judge)}</div>
            <div className="text-gray-500 text-xs mt-1">судья</div>
          </div>
        </div>
      )}

      {/* Post generation progress */}
      {Object.keys(posts).length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Посты</div>
          <div className="flex flex-wrap gap-2">
            {(config?.contestants || Object.keys(posts)).map(m => {
              const wc = posts[m]
              return (
                <span key={m} className={`text-xs px-2 py-1 rounded-full border ${
                  wc ? "border-emerald-800/50 bg-emerald-950/20 text-emerald-400"
                     : "border-[#2a2d3e] text-gray-600"
                }`}>
                  {shortName(m)}{wc ? ` · ${wc}сл` : ""}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Live standings */}
      {standings.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Рейтинг</div>
          <div className="card divide-y divide-[#2a2d3e]">
            {standings.slice(0, 10).map((s, i) => (
              <div key={s.model} className="flex items-center gap-3 py-2 px-1 text-sm">
                <span className="text-gray-600 w-5 text-right shrink-0">{medals[i + 1] || i + 1}</span>
                <span className={`flex-1 truncate ${i === 0 ? "text-white font-medium" : "text-gray-300"}`}>
                  {shortName(s.model)}
                </span>
                <span className={`text-xs tabular-nums ${i === 0 ? "text-emerald-400" : "text-gray-500"}`}>
                  {s.ts.toFixed(1)}
                </span>
                <span className="text-xs text-gray-600 w-16 text-right">
                  {s.W}W {s.L}L {s.D}D
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rounds */}
      {roundNums.length > 0 && (
        <div className="space-y-6">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Матчи</div>
          {roundNums.map(rnd => {
            const roundEnd = rounds.find(r => r.round === rnd)
            return (
              <RoundSection
                key={rnd}
                rnd={rnd}
                matches={matchesByRound[rnd] || []}
                comment={roundEnd?.comment || null}
              />
            )
          })}
        </div>
      )}

      {status === "idle" && matches.length === 0 && !done && (
        <div className="text-center py-12 text-gray-600">
          <div className="text-4xl mb-3">⚔️</div>
          <div>Запусти турнир — результаты появятся здесь в реальном времени</div>
        </div>
      )}
    </div>
  )
}
