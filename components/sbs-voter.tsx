"use client"
import { useState, useCallback } from "react"
import type { Tournament } from "@/lib/types"

interface Pair {
  tournament: Tournament
  modelA: string
  modelB: string
  postA: string
  postB: string
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildPairs(tournaments: Tournament[]): Pair[] {
  const pairs: Pair[] = []
  for (const t of tournaments) {
    const models = Object.keys(t.posts)
    for (let i = 0; i < models.length - 1; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const [a, b] = Math.random() > 0.5
          ? [models[i], models[j]]
          : [models[j], models[i]]
        pairs.push({
          tournament: t,
          modelA: a,
          modelB: b,
          postA: t.posts[a],
          postB: t.posts[b],
        })
      }
    }
  }
  return shuffleArray(pairs)
}

interface VoteResult {
  pairKey: string
  winner: "A" | "B" | "SKIP"
  modelA: string
  modelB: string
}

const STORAGE_KEY = "llm_arena_votes"

function loadVotes(): VoteResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
  } catch {
    return []
  }
}

function saveVote(vote: VoteResult) {
  const votes = loadVotes()
  const idx = votes.findIndex((v) => v.pairKey === vote.pairKey)
  if (idx >= 0) votes[idx] = vote
  else votes.push(vote)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(votes))
}

function computeStats(votes: VoteResult[]): Record<string, { wins: number; losses: number }> {
  const stats: Record<string, { wins: number; losses: number }> = {}
  for (const v of votes) {
    if (v.winner === "SKIP") continue
    const winner = v.winner === "A" ? v.modelA : v.modelB
    const loser = v.winner === "A" ? v.modelB : v.modelA
    stats[winner] = stats[winner] || { wins: 0, losses: 0 }
    stats[loser] = stats[loser] || { wins: 0, losses: 0 }
    stats[winner].wins++
    stats[loser].losses++
  }
  return stats
}

export default function SBSVoter({ tournaments }: { tournaments: Tournament[] }) {
  const [pairs] = useState(() => buildPairs(tournaments))
  const [idx, setIdx] = useState(0)
  const [voted, setVoted] = useState<VoteResult | null>(null)
  const [allVotes, setAllVotes] = useState<VoteResult[]>(() => {
    if (typeof window === "undefined") return []
    return loadVotes()
  })
  const [showStats, setShowStats] = useState(false)

  const pair = pairs[idx]

  const vote = useCallback(
    (choice: "A" | "B" | "SKIP") => {
      if (!pair) return
      const pairKey = `${pair.tournament.id}__${pair.modelA}__${pair.modelB}`
      const result: VoteResult = {
        pairKey,
        winner: choice,
        modelA: pair.modelA,
        modelB: pair.modelB,
      }
      saveVote(result)
      const updated = loadVotes()
      setAllVotes(updated)
      setVoted(result)

      // Also send to server
      fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: pair.tournament.id,
          post_a_model: pair.modelA,
          post_b_model: pair.modelB,
          winner: choice,
        }),
      }).catch(() => {})
    },
    [pair]
  )

  const next = () => {
    setVoted(null)
    setIdx((i) => (i + 1) % pairs.length)
  }

  const stats = computeStats(allVotes)
  const statsSorted = Object.entries(stats)
    .map(([m, s]) => ({ model: m, ...s, total: s.wins + s.losses }))
    .sort((a, b) => b.wins / (b.total || 1) - a.wins / (a.total || 1))

  if (!pair) {
    return <p className="text-gray-400">Нет постов для сравнения.</p>
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>Пара {idx + 1} / {pairs.length}</span>
        <span>{allVotes.filter((v) => v.winner !== "SKIP").length} голосов</span>
        <button
          onClick={() => setShowStats((s) => !s)}
          className="text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {showStats ? "Скрыть результаты" : "Показать результаты"}
        </button>
      </div>

      {/* Community stats */}
      {showStats && statsSorted.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3 text-gray-300">
            Результаты сообщества ({allVotes.length} голосов)
          </h3>
          <div className="space-y-2">
            {statsSorted.slice(0, 10).map((s) => {
              const wr = ((s.wins / s.total) * 100).toFixed(0)
              return (
                <div key={s.model} className="flex items-center gap-3">
                  <span className="text-sm text-gray-300 w-36 truncate">{s.model.split(":")[0]}</span>
                  <div className="flex-1 h-2 bg-[#2a2d3e] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${wr}%` }}
                    />
                  </div>
                  <span className="text-sm text-indigo-300 font-mono w-12 text-right">{wr}%</span>
                  <span className="text-xs text-gray-500 w-12 text-right">{s.wins}W/{s.losses}L</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Context */}
      <div className="text-xs text-gray-500 bg-[#13151f] rounded-lg px-3 py-2">
        Тема: {pair.tournament.task.trim().slice(0, 150)}…
      </div>

      {/* Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(["A", "B"] as const).map((side) => {
          const post = side === "A" ? pair.postA : pair.postB
          const isWinner = voted?.winner === side
          const isLoser = voted && voted.winner !== "SKIP" && voted.winner !== side
          return (
            <div
              key={side}
              className={`card flex flex-col transition-all ${
                isWinner
                  ? "border-emerald-600/60 bg-emerald-950/20"
                  : isLoser
                  ? "border-rose-900/40 opacity-60"
                  : "hover:border-indigo-600/40"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`badge text-base font-bold ${
                  side === "A" ? "bg-blue-600/20 text-blue-300" : "bg-purple-600/20 text-purple-300"
                }`}>
                  Пост {side}
                </span>
                {isWinner && <span className="text-emerald-400 text-sm font-medium">✓ Выбран</span>}
              </div>
              <p className="text-gray-200 text-sm leading-relaxed flex-1 whitespace-pre-wrap">
                {post}
              </p>
              {!voted && (
                <button
                  onClick={() => vote(side)}
                  className={`btn mt-4 w-full justify-center ${
                    side === "A" ? "bg-blue-700/30 hover:bg-blue-700/50 text-blue-300 border border-blue-700/50" :
                    "bg-purple-700/30 hover:bg-purple-700/50 text-purple-300 border border-purple-700/50"
                  }`}
                >
                  Пост {side} лучше
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Action row */}
      {!voted ? (
        <div className="flex justify-center">
          <button onClick={() => vote("SKIP")} className="btn-ghost text-gray-500">
            Пропустить
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          {voted.winner !== "SKIP" && (
            <p className="text-gray-400 text-sm">
              Ты выбрал Пост {voted.winner}
              <span className="text-gray-500"> (авторство скрыто)</span>
            </p>
          )}
          <button onClick={next} className="btn-primary px-8">
            Следующая пара →
          </button>
        </div>
      )}
    </div>
  )
}
