"use client"
import { useState, useEffect } from "react"
import TournamentLive from "@/components/tournament-live"
import ArticleForm from "@/components/article-form"

interface ModelInfo { name: string; size_gb: number }
interface TournamentSummary { id: string; run_at: string; task: string; judge: string; winner: string | null; models: number }

function TournamentForm({ models }: { models: ModelInfo[] }) {
  const [task, setTask]               = useState("")
  const [judge, setJudge]             = useState("")
  const [commentator, setCommentator] = useState("")
  const [maxCont, setMaxCont]         = useState("")
  const [rounds, setRounds]           = useState("")
  const [busy, setBusy]               = useState(false)
  const [result, setResult]           = useState<string | null>(null)

  // Auto-select first available model as default commentator
  useEffect(() => {
    if (models.length > 0 && !commentator) {
      setCommentator(models[0].name)
    }
  }, [models])

  async function submit() {
    if (!task.trim() || busy) return
    setBusy(true)
    setResult(null)
    try {
      const body: Record<string, unknown> = { task: task.trim() }
      if (judge)       body.judge = judge
      if (commentator) body.commentator = commentator
      if (maxCont)     body.max_contestants = parseInt(maxCont)
      if (rounds)      body.swiss_rounds = parseInt(rounds)

      const r = await fetch("/api/runner/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.ok) setResult("Турнир запущен!")
      else setResult(`Ошибка: ${d.error}`)
    } catch (e) {
      setResult(`Ошибка: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  const modelNames = models.map(m => m.name)

  return (
    <div className="card space-y-4">
      <h3 className="font-semibold text-white">Запустить турнир</h3>
      <div className="space-y-2">
        <textarea
          value={task} onChange={e => setTask(e.target.value)}
          placeholder="Задание для участников..."
          rows={3}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={judge} onChange={e => setJudge(e.target.value)}
            className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-gray-300"
          >
            <option value="">Судья — авто</option>
            {modelNames.map(m => <option key={m} value={m}>{m.split(":")[0]}</option>)}
          </select>
          <select
            value={commentator} onChange={e => setCommentator(e.target.value)}
            className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-gray-300"
          >
            <option value="">Комментатор — нет</option>
            {modelNames.map(m => <option key={m} value={m}>{m.split(":")[0]}</option>)}
          </select>
          <input
            type="number" value={maxCont} onChange={e => setMaxCont(e.target.value)}
            placeholder="Макс. участников"
            className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <input
            type="number" value={rounds} onChange={e => setRounds(e.target.value)}
            placeholder="Раундов (авто)"
            className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>
      <button
        onClick={submit}
        disabled={busy || !task.trim()}
        className="w-full py-2 px-4 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Запускаю..." : "⚔️ Запустить турнир"}
      </button>
      {result && <p className="text-sm text-gray-400">{result}</p>}
    </div>
  )
}

export default function AdminPage() {
  const [models, setModels]           = useState<ModelInfo[]>([])
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([])
  const [tab, setTab]                 = useState<"live" | "history" | "article">("live")
  const [refreshing, setRefreshing]   = useState(false)

  useEffect(() => {
    fetch("/api/runner/models").then(r => r.json()).then(d => setModels(d.available || [])).catch(() => {})
    fetch("/api/runner/tournaments").then(r => r.json()).then(setTournaments).catch(() => {})
  }, [])

  async function refreshModels() {
    setRefreshing(true)
    await fetch("/api/runner/models/refresh", { method: "POST" }).catch(() => {})
    setTimeout(() => {
      fetch("/api/runner/models").then(r => r.json()).then(d => setModels(d.available || [])).catch(() => {})
      setRefreshing(false)
    }, 3000)
  }

  const TABS = [
    { key: "live",    label: "⚡ Прямой эфир" },
    { key: "history", label: "📋 История" },
    { key: "article", label: "✍️ Статья" },
  ] as const

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Панель управления</h1>
          <p className="text-gray-400 text-sm mt-1">Запуск турниров и генерация статей прямо с сервера</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className={`px-2 py-1 rounded-full text-xs ${models.length > 0 ? "bg-emerald-900/30 text-emerald-400" : "bg-rose-900/30 text-rose-400"}`}>
            {models.length > 0 ? `${models.length} моделей` : "нет моделей"}
          </span>
          <button
            onClick={refreshModels}
            disabled={refreshing}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs border border-[#2a2d3e] px-2 py-1 rounded-lg"
          >
            {refreshing ? "..." : "↺ Обновить"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: tournament form + model list */}
        <div className="space-y-4">
          <TournamentForm models={models} />

          {models.length > 0 && (
            <div className="card">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Доступные модели</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {models.map(m => (
                  <div key={m.name} className="flex items-center justify-between text-xs text-gray-400">
                    <span className="truncate">{m.name.split(":")[0]}</span>
                    <span className="text-gray-600 shrink-0 ml-2">{m.size_gb > 0 ? `${m.size_gb}GB` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: live / history / article tabs */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-1 border-b border-[#2a2d3e]">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "live" && <TournamentLive />}

          {tab === "history" && (
            <div className="space-y-3">
              {tournaments.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                  <div className="text-3xl mb-2">📋</div>
                  <div>Турниров ещё нет</div>
                </div>
              ) : (
                tournaments.map(t => (
                  <a key={t.id} href={`/tournament/${t.id}`}
                     className="block card hover:border-indigo-700/50 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-200 leading-snug line-clamp-2">{t.task}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span>{new Date(t.run_at).toLocaleDateString("ru-RU")}</span>
                          <span>судья: {t.judge?.split(":")[0]}</span>
                          <span>{t.models} участников</span>
                        </div>
                      </div>
                      {t.winner && (
                        <span className="shrink-0 text-xs text-emerald-400 font-medium">
                          🥇 {t.winner.split(":")[0].split("/").pop()}
                        </span>
                      )}
                    </div>
                  </a>
                ))
              )}
            </div>
          )}

          {tab === "article" && (
            <div className="card">
              <ArticleForm models={models} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
