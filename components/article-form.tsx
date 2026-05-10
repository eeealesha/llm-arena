"use client"
import { useEffect, useState } from "react"

interface ModelInfo { name: string; size_gb: number }
interface TournamentSummary { id: string; run_at: string; task: string; winner: string | null; models: number }
interface Roles { planner: string; storyteller: string; analyst: string; editor: string; chief_editor: string }

const ROLE_LABELS: Record<keyof Roles, { icon: string; label: string; criterion: string }> = {
  chief_editor: { icon: "👑", label: "Выпускающий редактор", criterion: "Победитель турнира (TrueSkill #1)" },
  editor:       { icon: "✅", label: "Редактор",             criterion: "Лучшая точность (accuracy)" },
  storyteller:  { icon: "✍️",  label: "Автор-сторителлер",   criterion: "Лучший engagement + originality" },
  analyst:      { icon: "🔬", label: "Автор-аналитик",       criterion: "Лучший informativeness + accuracy" },
  planner:      { icon: "📋", label: "Планёр",               criterion: "Лучшая оригинальность (originality)" },
}

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }

function assignRoles(tournament: { ranking: { model: string; criteria?: Record<string, number> }[] }): Roles {
  const ranked = tournament.ranking
  const withCriteria = ranked.filter(r => r.criteria)
  const get = (key: string) => (m: string) => withCriteria.find(r => r.model === m)?.criteria?.[key] ?? 0

  const chief_editor = ranked[0]?.model ?? ""
  const models = withCriteria.map(r => r.model)

  const editor = models.sort((a, b) => get("accuracy")(b) - get("accuracy")(a))[0] ?? chief_editor
  const storyteller = models.sort((a, b) =>
    (get("engagement")(b) + get("originality")(b)) - (get("engagement")(a) + get("originality")(a))
  )[0] ?? chief_editor
  const analyst = models.sort((a, b) =>
    (get("informativeness")(b) + get("accuracy")(b)) - (get("informativeness")(a) + get("accuracy")(a))
  )[0] ?? chief_editor
  const planner = models.sort((a, b) => get("originality")(b) - get("originality")(a))[0] ?? chief_editor

  return { chief_editor, editor, storyteller, analyst, planner }
}

export default function ArticleForm({ models }: { models: ModelInfo[] }) {
  const [topic, setTopic]           = useState("")
  const [style, setStyle]           = useState<"storyteller" | "analyst">("storyteller")
  const [roles, setRoles]           = useState<Roles | null>(null)
  const [tournaments, setTournaments] = useState<any[]>([])
  const [selectedT, setSelectedT]   = useState<string>("")
  const [busy, setBusy]             = useState(false)
  const [result, setResult]         = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch("/api/runner/tournaments")
      .then(r => r.json())
      .then((ts: TournamentSummary[]) => {
        setTournaments(ts)
        if (ts.length > 0) loadTournamentRoles(ts[0].id)
      })
      .catch(() => {})
  }, [])

  async function loadTournamentRoles(id: string) {
    setSelectedT(id)
    try {
      const r = await fetch(`/api/runner/tournament/${id}`)
      if (!r.ok) return
      const t = await r.json()
      if (t.ranking) setRoles(assignRoles(t))
    } catch {}
  }

  const modelNames = models.map(m => m.name)

  async function submit() {
    if (!topic.trim() || busy || !roles) return
    setBusy(true)
    setResult(null)
    try {
      const r = await fetch("/api/runner/article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          style,
          roles,
          tournament_file: selectedT ? `data/tournaments/${selectedT}.json` : undefined,
        }),
      })
      const d = await r.json()
      if (d.ok) setResult({ ok: true, msg: "Запущено — следи за стримом" })
      else setResult({ ok: false, msg: d.error || "Ошибка" })
    } catch (e) {
      setResult({ ok: false, msg: String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Тема статьи</label>
        <textarea
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Например: Как выбрать LLM для production в 2026"
          rows={2}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      {/* Style */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Стиль</label>
        <div className="flex gap-2">
          {(["storyteller", "analyst"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                style === s
                  ? "bg-indigo-600/20 border-indigo-600/50 text-indigo-300"
                  : "border-[#2a2d3e] text-gray-400 hover:border-indigo-700/30 hover:text-gray-300"
              }`}
            >
              {s === "storyteller" ? "✍️ Сторителлер" : "🔬 Аналитик"}
            </button>
          ))}
        </div>
      </div>

      {/* Tournament source */}
      {tournaments.length > 0 && (
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Роли из турнира</label>
          <select
            value={selectedT}
            onChange={e => loadTournamentRoles(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-gray-300"
          >
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>
                {new Date(t.run_at).toLocaleDateString("ru-RU")} — {t.winner ? shortName(t.winner) : "?"} побед.
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Role assignments */}
      {roles && (
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-2">Редакционная команда</label>
          <div className="space-y-2">
            {(Object.keys(ROLE_LABELS) as (keyof Roles)[]).map(role => {
              const meta = ROLE_LABELS[role]
              const isAuthor = role === "storyteller" || role === "analyst"
              const highlighted = isAuthor && role === style
              return (
                <div
                  key={role}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                    highlighted ? "border-indigo-700/50 bg-indigo-950/20" : "border-[#2a2d3e]"
                  } ${isAuthor && role !== style ? "opacity-40" : ""}`}
                >
                  <span className="text-lg w-6 shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400 font-medium">{meta.label}</div>
                    <div className="text-xs text-gray-600">{meta.criterion}</div>
                  </div>
                  <select
                    value={roles[role]}
                    onChange={e => setRoles(r => r ? { ...r, [role]: e.target.value } : r)}
                    className="bg-[#0a0c12] border border-[#2a2d3e] rounded px-2 py-1 text-xs text-gray-300 max-w-[140px]"
                  >
                    {modelNames.map(m => (
                      <option key={m} value={m}>{shortName(m)}</option>
                    ))}
                    {!modelNames.includes(roles[role]) && (
                      <option value={roles[role]}>{shortName(roles[role])}</option>
                    )}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!roles && (
        <div className="text-center py-4 text-gray-600 text-sm">
          Роли определяются по результатам турнира
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !topic.trim() || !roles}
        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Запускаю..." : "✍️ Написать статью"}
      </button>

      {result && (
        <p className={`text-sm ${result.ok ? "text-emerald-400" : "text-rose-400"}`}>{result.msg}</p>
      )}
    </div>
  )
}
