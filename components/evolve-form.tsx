"use client"
import { useEffect, useState } from "react"

interface ModelInfo { name: string; size_gb: number }

const ALL_OPS = ["zero_order", "first_order", "hyper", "lamarckian"] as const
const OP_LABELS: Record<typeof ALL_OPS[number], string> = {
  zero_order:  "🎲 Zero-order",
  first_order: "✏️ First-order",
  hyper:       "🌀 Hyper-mutation",
  lamarckian:  "🧬 Lamarckian",
}

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }

export default function EvolveForm({ models }: { models: ModelInfo[] }) {
  const [theme, setTheme]               = useState("")
  const [baseTask, setBaseTask]         = useState("")
  const [judge, setJudge]               = useState("")
  const [contestants, setContestants]   = useState<string[]>([])
  const [generations, setGenerations]   = useState("2")
  const [perGen, setPerGen]             = useState("3")
  const [ops, setOps]                   = useState<string[]>([...ALL_OPS])
  const [busy, setBusy]                 = useState(false)
  const [result, setResult]             = useState<string | null>(null)

  useEffect(() => {
    if (models.length && !judge) setJudge(models[0].name)
    if (models.length && !contestants.length) {
      setContestants(models.slice(0, Math.min(3, models.length)).map(m => m.name))
    }
  }, [models])

  function toggleContestant(name: string) {
    setContestants(c => c.includes(name) ? c.filter(x => x !== name) : [...c, name])
  }
  function toggleOp(op: string) {
    setOps(o => o.includes(op) ? o.filter(x => x !== op) : [...o, op])
  }

  async function submit() {
    if (!theme.trim() || !baseTask.trim() || !judge || !contestants.length || !ops.length || busy) return
    setBusy(true); setResult(null)
    try {
      const r = await fetch("/api/runner/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: theme.trim(),
          base_task: baseTask.trim(),
          judge,
          contestants,
          generations: parseInt(generations || "2"),
          candidates_per_gen: parseInt(perGen || "3"),
          operators: ops.join(","),
        }),
      })
      const d = await r.json()
      if (d.ok) setResult("Эволюция запущена — смотри в Прямом эфире.")
      else setResult(`Ошибка: ${d.error}`)
    } catch (e) {
      setResult(`Ошибка: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = theme.trim() && baseTask.trim() && judge && contestants.length && ops.length && !busy

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Тема (slug-key)</label>
        <input
          value={theme} onChange={e => setTheme(e.target.value)}
          placeholder="Объясни RAG джуну"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <p className="text-[11px] text-gray-600 mt-1">
          Lineage сохраняется по slug темы — повторный запуск продолжает существующую популяцию.
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">
          Базовый промпт (gen 0)
        </label>
        <textarea
          value={baseTask} onChange={e => setBaseTask(e.target.value)}
          placeholder="Напиши пост 250 слов: что такое RAG, как работает, типичные ловушки..."
          rows={3}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Поколений</label>
          <input
            type="number" min={1} max={5} value={generations} onChange={e => setGenerations(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Кандидатов/поколение</label>
          <input
            type="number" min={1} max={6} value={perGen} onChange={e => setPerGen(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Судья</label>
        <select
          value={judge} onChange={e => setJudge(e.target.value)}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-gray-300"
        >
          {models.map(m => <option key={m.name} value={m.name}>{shortName(m.name)}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">
          Пул-исполнители ({contestants.length} выбрано)
        </label>
        <div className="space-y-1 max-h-40 overflow-y-auto border border-[#2a2d3e] rounded-lg p-2">
          {models.map(m => (
            <label key={m.name} className="flex items-center gap-2 text-xs text-gray-400 hover:bg-[#1a1d27] px-1.5 py-1 rounded cursor-pointer">
              <input
                type="checkbox" checked={contestants.includes(m.name)} onChange={() => toggleContestant(m.name)}
                className="accent-indigo-500"
              />
              <span className="truncate">{shortName(m.name)}</span>
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 mt-1">
          Каждый кандидат-промпт оценивается всеми выбранными моделями.
        </p>
      </div>

      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Мутационные операторы</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_OPS.map(op => (
            <button
              key={op}
              onClick={() => toggleOp(op)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                ops.includes(op)
                  ? "bg-indigo-600/30 border-indigo-600/50 text-indigo-200"
                  : "border-[#2a2d3e] text-gray-500 hover:border-indigo-700/30"
              }`}
            >
              {OP_LABELS[op]}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full py-2 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Запускаю..." : "🧬 Запустить эволюцию"}
      </button>
      {result && <p className="text-sm text-gray-400">{result}</p>}
    </div>
  )
}
