"use client"
import { useEffect, useRef, useState } from "react"

interface TsEntry { model: string; rank: number; ts: number; mu: number; sigma: number; W: number; L: number; D: number }
interface MatchEvent { round: number; match: number; A: string; B: string; verdict: string; reasoning: string; scores_a: Record<string, number>; scores_b: Record<string, number>; ts_a: number; ts_b: number }
interface RoundEnd { round: number; standings: TsEntry[]; comment: string | null }

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }
function scoreTotal(s: Record<string, number> | undefined) {
  if (!s) return null
  return Object.values(s).reduce((a, b) => a + b, 0)
}

function PostCard({ model, words, text }: { model: string; words: number; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#2a2d3e] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-[#1a1d27] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          <span className="text-gray-200 font-medium">{shortName(model)}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">{words} слов</span>
          <span className="text-gray-600 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-[#2a2d3e] px-4 py-3 bg-[#0a0c12]">
          <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{text}</div>
        </div>
      )}
    </div>
  )
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
        <div className={`flex items-center gap-2 px-3 py-2.5 ${won_a ? "bg-emerald-950/30" : won_b ? "opacity-50" : ""}`}>
          <div className={`w-0.5 h-6 rounded-full shrink-0 ${won_a ? "bg-emerald-500" : "bg-[#2a2d3e]"}`} />
          <span className={won_a ? "text-white font-medium" : "text-gray-400"}>{shortName(m.A)}</span>
          {sa !== null && <span className={`ml-auto text-xs ${won_a ? "text-emerald-400" : "text-gray-600"}`}>{sa}/20</span>}
        </div>
        <div className="flex flex-col items-center justify-center px-3 border-x border-[#2a2d3e] text-xs text-gray-500 bg-[#0f1117]">
          <span>М{m.match}</span>
          <span className={`font-bold mt-0.5 ${m.verdict === "DRAW" ? "text-amber-400" : "text-gray-300"}`}>
            {m.verdict === "DRAW" ? "=" : m.verdict}
          </span>
        </div>
        <div className={`flex items-center gap-2 px-3 py-2.5 flex-row-reverse ${won_b ? "bg-emerald-950/30" : won_a ? "opacity-50" : ""}`}>
          <div className={`w-0.5 h-6 rounded-full shrink-0 ${won_b ? "bg-emerald-500" : "bg-[#2a2d3e]"}`} />
          <span className={won_b ? "text-white font-medium" : "text-gray-400"}>{shortName(m.B)}</span>
          {sb !== null && <span className={`mr-auto text-xs ${won_b ? "text-emerald-400" : "text-gray-600"}`}>{sb}/20</span>}
        </div>
      </div>
      {open && (
        <div className="border-t border-[#2a2d3e] bg-[#0a0c12] px-4 py-3 space-y-3">
          <p className="text-gray-300 text-sm leading-relaxed">{m.reasoning}</p>
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div className="space-y-0.5">
              <div className="text-gray-400 font-medium mb-1">{shortName(m.A)}</div>
              {Object.entries(m.scores_a || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between"><span>{k}</span><span className="text-gray-300">{v}</span></div>
              ))}
              <div className="flex justify-between border-t border-[#2a2d3e] mt-1 pt-1 text-gray-400 font-medium"><span>TS</span><span>{m.ts_a}</span></div>
            </div>
            <div className="space-y-0.5">
              <div className="text-gray-400 font-medium mb-1">{shortName(m.B)}</div>
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
        <span className="text-xs text-gray-600">{matches.length} матчей</span>
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

const medals: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

export default function TournamentLive() {
  const [status, setStatus]       = useState<string>("connecting")
  const [posts, setPosts]         = useState<Record<string, { words: number; text: string }>>({})
  const [matches, setMatches]     = useState<MatchEvent[]>([])
  const [rounds, setRounds]       = useState<RoundEnd[]>([])
  const [standings, setStandings] = useState<TsEntry[]>([])
  const [statusMsg, setStatusMsg] = useState<string>("")
  const [config, setConfig]       = useState<{ contestants: string[]; rounds: number; judge: string } | null>(null)
  const [done, setDone]           = useState<{ winner: string; tournament_id: string } | null>(null)
  const [tab, setTab]             = useState<"matches" | "posts">("matches")
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    connect()
    return () => esRef.current?.close()
  }, [])

  function connect() {
    if (esRef.current) esRef.current.close()
    const es = new EventSource("/api/runner/stream")
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data)
        handleEvent(evt)
        if (evt.type === "runner_end") es.close()
      } catch { /* ignore */ }
    }
    es.onerror = () => {
      setStatus(s => s === "running" ? "disconnected" : s)
      es.close()
    }
  }

  function handleEvent(evt: Record<string, unknown>) {
    switch (evt.type) {
      case "config":
        setConfig({ contestants: (evt.contestants as string[]) || [], rounds: 0, judge: (evt.judge as string) || "" })
        setStatus("running")
        break
      case "tournament_start":
        setConfig(c => c ? { ...c, rounds: evt.rounds as number } : null)
        setStatus("running")
        break
      case "post_done":
        setPosts(p => ({ ...p, [evt.model as string]: { words: evt.words as number, text: evt.text as string || "" } }))
        setTab("posts")
        break
      case "match_start":
        setStatus("running")
        setStatusMsg(`Раунд ${evt.round}, матч ${evt.match}: ${shortName(evt.A as string)} vs ${shortName(evt.B as string)}`)
        break
      case "match":
        setMatches(ms => [...ms, evt as unknown as MatchEvent])
        setTab("matches")
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
      case "comment_start":
        setStatusMsg(`Комментатор пишет про раунд ${evt.round}...`)
        break
      case "status":
        setStatusMsg(evt.message as string)
        break
      case "done":
        setDone({ winner: evt.winner as string, tournament_id: evt.tournament_id as string })
        setStatus("done")
        setStatusMsg("")
        break
      case "runner_start":
        setStatus("running")
        setPosts({})
        setMatches([])
        setRounds([])
        setStandings([])
        setDone(null)
        setConfig(null)
        break
      case "error":
        setStatusMsg(`Ошибка: ${evt.message}`)
        setStatus("error")
        break
      case "runner_end":
        setStatus(s => s === "running" ? "idle" : s)
        break
      case "cancelled":
        setStatus("idle")
        setStatusMsg("Остановлено")
        break
    }
  }

  const matchesByRound: Record<number, MatchEvent[]> = {}
  for (const m of matches) {
    (matchesByRound[m.round] = matchesByRound[m.round] || []).push(m)
  }
  const roundNums = Array.from(
    new Set([...Object.keys(matchesByRound).map(Number), ...rounds.map(r => r.round)])
  ).sort((a, b) => a - b)

  const postModels = Object.keys(posts)
  const isRunning = status === "running"
  const hasData = matches.length > 0 || postModels.length > 0 || done !== null

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
        isRunning       ? "border-indigo-700/50 bg-indigo-950/20 text-indigo-300" :
        status === "done"    ? "border-emerald-700/50 bg-emerald-950/20 text-emerald-300" :
        status === "error"   ? "border-rose-700/50 bg-rose-950/20 text-rose-300" :
        status === "connecting" ? "border-[#2a2d3e] text-gray-600" :
        "border-[#2a2d3e] text-gray-500"
      }`}>
        {isRunning && <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />}
        <span className="font-medium shrink-0">
          {isRunning ? "Идёт турнир" : status === "done" ? "Завершён" :
           status === "connecting" ? "Подключение..." : status === "error" ? "Ошибка" : "Ожидание"}
        </span>
        {statusMsg && <span className="text-gray-400 text-xs truncate">{statusMsg}</span>}
        {isRunning && (
          <button
            onClick={() => fetch("/api/runner/cancel", { method: "POST" })}
            className="ml-auto shrink-0 text-rose-400 hover:text-rose-300 text-xs border border-rose-800/50 px-2 py-0.5 rounded"
          >
            Стоп
          </button>
        )}
      </div>

      {/* Done banner */}
      {done && (
        <div className="card border-emerald-800/50 bg-emerald-950/20 text-center py-5">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-white font-bold">{shortName(done.winner)}</div>
          <div className="text-emerald-400 text-xs mt-1">Победитель</div>
          <a href={`/tournament/${done.tournament_id}`}
             className="mt-3 inline-block px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors">
            Открыть результаты →
          </a>
        </div>
      )}

      {/* Config summary */}
      {config && (
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="px-2 py-1 rounded bg-[#1a1d27] border border-[#2a2d3e]">
            {config.contestants.length} участников
          </span>
          {config.rounds > 0 && (
            <span className="px-2 py-1 rounded bg-[#1a1d27] border border-[#2a2d3e]">
              {config.rounds} раундов
            </span>
          )}
          <span className="px-2 py-1 rounded bg-[#1a1d27] border border-[#2a2d3e]">
            судья: {shortName(config.judge)}
          </span>
        </div>
      )}

      {/* Live standings */}
      {standings.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#2a2d3e] text-xs text-gray-500 uppercase tracking-wide">
            Рейтинг
          </div>
          <div className="divide-y divide-[#2a2d3e]">
            {standings.slice(0, 8).map((s, i) => (
              <div key={s.model} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-5 text-center shrink-0">{medals[i + 1] || <span className="text-gray-600">{i + 1}</span>}</span>
                <span className={`flex-1 truncate ${i === 0 ? "text-white font-medium" : "text-gray-300"}`}>
                  {shortName(s.model)}
                </span>
                <span className={`tabular-nums text-xs ${i === 0 ? "text-emerald-400" : "text-gray-500"}`}>
                  {s.ts.toFixed(1)}
                </span>
                <span className="text-xs text-gray-600 w-20 text-right">{s.W}W {s.L}L {s.D}D</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs: matches / posts */}
      {hasData && (
        <div>
          <div className="flex gap-1 border-b border-[#2a2d3e] mb-4">
            <button
              onClick={() => setTab("matches")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "matches" ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              ⚔️ Матчи {matches.length > 0 && <span className="text-xs text-gray-600 ml-1">{matches.length}</span>}
            </button>
            <button
              onClick={() => setTab("posts")}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "posts" ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              📝 Посты {postModels.length > 0 && <span className="text-xs text-gray-600 ml-1">{postModels.length}</span>}
            </button>
          </div>

          {tab === "matches" && (
            <div className="space-y-6">
              {roundNums.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">
                  {isRunning ? "Ожидаем начала матчей..." : "Матчей пока нет"}
                </div>
              ) : (
                roundNums.map(rnd => (
                  <RoundSection
                    key={rnd}
                    rnd={rnd}
                    matches={matchesByRound[rnd] || []}
                    comment={rounds.find(r => r.round === rnd)?.comment || null}
                  />
                ))
              )}
            </div>
          )}

          {tab === "posts" && (
            <div className="space-y-2">
              {postModels.length === 0 ? (
                <div className="text-center py-8 text-gray-600 text-sm">
                  {isRunning ? "Модели пишут посты..." : "Постов пока нет"}
                </div>
              ) : (
                postModels.map(model => (
                  <PostCard
                    key={model}
                    model={model}
                    words={posts[model].words}
                    text={posts[model].text}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {!hasData && status !== "connecting" && status !== "running" && (
        <div className="text-center py-12 text-gray-600">
          <div className="text-4xl mb-3">⚔️</div>
          <div>Запусти турнир — результаты появятся здесь в реальном времени</div>
        </div>
      )}
    </div>
  )
}
