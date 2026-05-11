"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import TournamentLive from "@/components/tournament-live"
import ArticleForm from "@/components/article-form"
import EvolveForm from "@/components/evolve-form"

interface ModelInfo { name: string; size_gb: number }
interface TournamentSummary { id: string; run_at: string; task: string; judge: string; winner: string | null; models: number }
interface ArticleSummary { id: string; topic: string; published_at: string; author_style: string; roles: Record<string, string> }

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }

function TournamentForm({ models }: { models: ModelInfo[] }) {
  const [task, setTask]               = useState("")
  const [judge, setJudge]             = useState("")
  const [commentator, setCommentator] = useState("")
  const [maxCont, setMaxCont]         = useState("")
  const [rounds, setRounds]           = useState("")
  const [busy, setBusy]               = useState(false)
  const [result, setResult]           = useState<string | null>(null)

  useEffect(() => {
    if (models.length > 0 && !commentator) setCommentator(models[0].name)
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
            {modelNames.map(m => <option key={m} value={m}>{shortName(m)}</option>)}
          </select>
          <select
            value={commentator} onChange={e => setCommentator(e.target.value)}
            className="bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-gray-300"
          >
            <option value="">Комментатор — нет</option>
            {modelNames.map(m => <option key={m} value={m}>{shortName(m)}</option>)}
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

function TournamentHistory({ tournaments }: { tournaments: TournamentSummary[] }) {
  if (tournaments.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-3xl mb-2">📋</div>
        <div>Турниров ещё нет</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {tournaments.map(t => (
        <Link key={t.id} href={`/tournament/${t.id}`}
              className="block card hover:border-indigo-700/50 transition-colors group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 leading-snug line-clamp-2">{t.task}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{new Date(t.run_at).toLocaleDateString("ru-RU")}</span>
                <span>судья: {shortName(t.judge ?? "")}</span>
                <span>{t.models} участников</span>
              </div>
            </div>
            {t.winner && (
              <span className="shrink-0 text-xs text-emerald-400 font-medium">
                🥇 {shortName(t.winner)}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function LineageHistory({ lineages }: { lineages: Array<{ theme_slug: string; theme_label: string; prompts: number; generations: number; best_score: number | null }> }) {
  if (lineages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-3xl mb-2">🧬</div>
        <div>Веток пока нет — запусти первую эволюцию</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {lineages.map(l => (
        <Link key={l.theme_slug} href={`/prompts/${l.theme_slug}`}
              className="block card hover:border-indigo-700/50 transition-colors group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 leading-snug font-medium truncate">{l.theme_label}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{l.prompts} промптов</span>
                <span>·</span>
                <span>{l.generations} поколений</span>
              </div>
            </div>
            {l.best_score !== null && (
              <span className="shrink-0 text-xs text-amber-300 font-mono">{l.best_score.toFixed(2)}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

function ArticleHistory({ articles }: { articles: ArticleSummary[] }) {
  if (articles.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-3xl mb-2">📝</div>
        <div>Статей ещё нет</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {articles.map(a => (
        <Link key={a.id} href={`/blog/${a.id}`}
              className="block card hover:border-indigo-700/50 transition-colors group">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 leading-snug line-clamp-2 font-medium">{a.topic}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{new Date(a.published_at).toLocaleDateString("ru-RU")}</span>
                <span>{a.author_style === "storyteller" ? "✍️ сторителлер" : "🔬 аналитик"}</span>
                <span className="truncate">автор: {shortName(a.roles?.author ?? "")}</span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default function AdminPage() {
  const [models, setModels]           = useState<ModelInfo[]>([])
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([])
  const [articles, setArticles]       = useState<ArticleSummary[]>([])
  const [mode, setMode]               = useState<"tournament" | "article" | "evolve">("evolve")
  const [view, setView]               = useState<"live" | "history">("live")
  const [lineages, setLineages]       = useState<Array<{ theme_slug: string; theme_label: string; prompts: number; generations: number; best_score: number | null }>>([])
  const [refreshing, setRefreshing]   = useState(false)

  useEffect(() => {
    fetch("/api/runner/models").then(r => r.json()).then(d => setModels(d.available || [])).catch(() => {})
    fetch("/api/runner/tournaments").then(r => r.json()).then(setTournaments).catch(() => {})
    fetch("/api/articles").then(r => r.json()).then(setArticles).catch(() => {})
    fetch("/api/runner/lineage").then(r => r.json()).then(setLineages).catch(() => {})
  }, [])

  async function refreshModels() {
    setRefreshing(true)
    try {
      const r = await fetch("/api/runner/models/refresh", { method: "POST" })
      if (!r.ok) { setRefreshing(false); return }
      const poll = setInterval(async () => {
        try {
          const s = await fetch("/api/runner/status").then(r => r.json())
          if (!s?.running) {
            clearInterval(poll)
            fetch("/api/runner/models").then(r => r.json()).then(d => setModels(d.available || [])).catch(() => {})
            setRefreshing(false)
          }
        } catch {
          clearInterval(poll)
          setRefreshing(false)
        }
      }, 1500)
    } catch {
      setRefreshing(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Панель управления</h1>
          <p className="text-gray-400 text-sm mt-1">Запуск турниров и генерация статей</p>
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

      {/* Top-level mode toggle */}
      <div className="inline-flex p-1 rounded-xl bg-[#13151f] border border-[#2a2d3e]">
        <button
          onClick={() => setMode("evolve")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "evolve" ? "bg-fuchsia-700 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          🧬 Эволюция
        </button>
        <button
          onClick={() => setMode("tournament")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "tournament" ? "bg-emerald-700 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          ⚔️ Турниры
        </button>
        <button
          onClick={() => setMode("article")}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            mode === "article" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          ✍️ Статьи
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: form for selected mode */}
        <div className="space-y-4">
          {mode === "tournament" && <TournamentForm models={models} />}
          {mode === "article" && (
            <div className="card">
              <h3 className="font-semibold text-white mb-4">Написать статью</h3>
              <ArticleForm models={models} />
            </div>
          )}
          {mode === "evolve" && (
            <div className="card">
              <h3 className="font-semibold text-white mb-4">Запустить эволюцию промптов</h3>
              <EvolveForm models={models} />
            </div>
          )}

          {models.length > 0 && (
            <div className="card">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">Доступные модели</div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {models.map(m => (
                  <div key={m.name} className="flex items-center justify-between text-xs text-gray-400">
                    <span className="truncate">{shortName(m.name)}</span>
                    <span className="text-gray-600 shrink-0 ml-2">{m.size_gb > 0 ? `${m.size_gb}GB` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: live / history */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-1 border-b border-[#2a2d3e]">
            <button
              onClick={() => setView("live")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === "live" ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              ⚡ Прямой эфир
            </button>
            <button
              onClick={() => setView("history")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === "history" ? "text-white border-b-2 border-indigo-400 -mb-px" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              📋 {mode === "tournament" ? "История турниров"
                  : mode === "article"   ? "История статей"
                  :                        "Ветки эволюции"}
            </button>
          </div>

          {view === "live" && <TournamentLive />}
          {view === "history" && mode === "tournament" && <TournamentHistory tournaments={tournaments} />}
          {view === "history" && mode === "article"    && <ArticleHistory articles={articles} />}
          {view === "history" && mode === "evolve"     && <LineageHistory lineages={lineages} />}
        </div>
      </div>
    </div>
  )
}
