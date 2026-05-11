"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import TournamentLive from "@/components/tournament-live"
import EvolveForm from "@/components/evolve-form"

interface ModelInfo { name: string; size_gb: number }

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }

function LineageHistory({
  lineages,
}: {
  lineages: Array<{ theme_slug: string; theme_label: string; prompts: number; generations: number; best_score: number | null }>
}) {
  if (lineages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <div className="text-3xl mb-2">🧬</div>
        <div>Нет веток — запустите первую эволюцию</div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {lineages.map(l => (
        <Link
          key={l.theme_slug}
          href={`/prompts/${l.theme_slug}`}
          className="block card hover:border-indigo-700/50 transition-colors group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 leading-snug font-medium truncate">
                {l.theme_label}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{l.prompts} промптов</span>
                <span>·</span>
                <span>{l.generations} поколений</span>
              </div>
            </div>
            {l.best_score !== null && (
              <span className="shrink-0 text-xs text-amber-300 font-mono">
                {l.best_score.toFixed(2)}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  )
}

export default function AdminPage() {
  const [models, setModels]     = useState<ModelInfo[]>([])
  const [lineages, setLineages] = useState<
    Array<{ theme_slug: string; theme_label: string; prompts: number; generations: number; best_score: number | null }>
  >([])
  const [view, setView]         = useState<"live" | "history">("live")
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetch("/api/runner/models")
      .then(r => r.json())
      .then(d => setModels(d.available || []))
      .catch(() => {})
    fetch("/api/runner/lineage")
      .then(r => r.json())
      .then(setLineages)
      .catch(() => {})
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
            fetch("/api/runner/models")
              .then(r => r.json())
              .then(d => setModels(d.available || []))
              .catch(() => {})
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Эволюция промптов</h1>
          <p className="text-gray-400 text-sm mt-1">
            Промпт → Модели генерируют → Судья оценивает (Double-Shuffle) → Судья мутирует → Новый промпт
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`px-2 py-1 rounded-full text-xs ${
              models.length > 0
                ? "bg-emerald-900/30 text-emerald-400"
                : "bg-rose-900/30 text-rose-400"
            }`}
          >
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
        {/* Left: EvolveForm + model list */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="font-semibold text-white mb-4">🧬 Запустить эволюцию</h3>
            <EvolveForm models={models} />
          </div>

          {models.length > 0 && (
            <div className="card">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-3">
                Доступные модели
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {models.map(m => (
                  <div
                    key={m.name}
                    className="flex items-center justify-between text-xs text-gray-400"
                  >
                    <span className="truncate">{shortName(m.name)}</span>
                    <span className="text-gray-600 shrink-0 ml-2">
                      {m.size_gb > 0 ? `${m.size_gb}GB` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Criteria legend */}
          <div className="card text-xs text-gray-500 space-y-1">
            <div className="text-gray-400 font-medium mb-2">Критерии оценки (1–10)</div>
            <div><span className="text-gray-300">instruction_following</span> — выполнение всех требований</div>
            <div><span className="text-gray-300">logic_accuracy</span> — факты и реальные ссылки</div>
            <div><span className="text-gray-300">density</span> — без воды и AI-заглушек</div>
            <div><span className="text-gray-300">specificity</span> — конкретные детали, цифры</div>
          </div>
        </div>

        {/* Right: live stream / history */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-1 border-b border-[#2a2d3e]">
            <button
              onClick={() => setView("live")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === "live"
                  ? "text-white border-b-2 border-indigo-400 -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              ⚡ Live
            </button>
            <button
              onClick={() => setView("history")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === "history"
                  ? "text-white border-b-2 border-indigo-400 -mb-px"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              📋 Ветки
            </button>
          </div>

          {view === "live" && <TournamentLive />}
          {view === "history" && <LineageHistory lineages={lineages} />}
        </div>
      </div>
    </div>
  )
}
