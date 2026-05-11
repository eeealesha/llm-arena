"use client"
import { useEffect, useState } from "react"

interface ModelInfo { name: string; size_gb: number }

const ALL_OPS = [
  "zero_order", "first_order", "hyper", "lamarckian",
  "eda", "eda_rank_index", "lineage_based", "crossover", "workbook",
] as const

type Op = typeof ALL_OPS[number]

const OP_LABELS: Record<Op, string> = {
  zero_order:     "🎲 Нулевой порядок",
  first_order:    "✏️ Первый порядок",
  hyper:          "🌀 Гипер-мутация",
  lamarckian:     "🧬 Ламарковская",
  eda:            "📊 EDA",
  eda_rank_index: "📈 EDA-ранг",
  lineage_based:  "🌿 Линейный",
  crossover:      "✂️ Кроссовер",
  workbook:       "📓 Рабочая книга",
}

const OP_TOOLTIPS: Record<Op, string> = {
  zero_order:     "Генерирует новый промпт из темы — без родителя",
  first_order:    "Мутирует родителя по случайной инструкции (FOHM)",
  hyper:          "Самоссылочный: придумывает новую операцию, затем применяет к родителю",
  lamarckian:     "Реверс-инжиниринг идеального промпта из лучшего ответа",
  eda:            "Оценка распределения: синтез нового промпта из топ-N лучших",
  eda_rank_index: "Как EDA, но с ранжированием — просит превзойти промпт №1",
  lineage_based:  "Показывает всю цепочку предков и просит экстраполировать следующее поколение",
  crossover:      "Комбинирует лучшие элементы двух родительских промптов",
  workbook:       "Реверс-инжиниринг идеального промпта из нескольких качественных ответов",
}

function shortName(m: string) { return m.split(":")[0].split("/").pop() ?? m }

export default function EvolveForm({ models }: { models: ModelInfo[] }) {
  const [theme, setTheme]             = useState("")
  const [seeds, setSeeds]             = useState<string[]>([""])
  const [judge, setJudge]             = useState("")
  const [contestants, setContestants] = useState<string[]>([])
  const [generations, setGenerations] = useState("2")
  const [perGen, setPerGen]           = useState("3")
  const [ops, setOps]                 = useState<string[]>([...ALL_OPS])
  const [busy, setBusy]               = useState(false)
  const [result, setResult]           = useState<string | null>(null)

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
  function updateSeed(i: number, val: string) {
    setSeeds(s => { const n = [...s]; n[i] = val; return n })
  }
  function addSeed() {
    setSeeds(s => [...s, ""])
  }
  function removeSeed(i: number) {
    setSeeds(s => s.length > 1 ? s.filter((_, idx) => idx !== i) : s)
  }

  const validSeeds = seeds.filter(s => s.trim())

  async function submit() {
    if (!theme.trim() || !validSeeds.length || !judge || !contestants.length || !ops.length || busy) return
    setBusy(true); setResult(null)
    try {
      const r = await fetch("/api/runner/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: theme.trim(),
          seeds: validSeeds,
          judge,
          contestants,
          generations: parseInt(generations || "2"),
          candidates_per_gen: parseInt(perGen || "3"),
          operators: ops.join(","),
        }),
      })
      const d = await r.json()
      if (d.ok) setResult("Эволюция запущена — смотри вкладку Live.")
      else setResult(`Ошибка: ${d.error}`)
    } catch (e) {
      setResult(`Ошибка: ${e}`)
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = theme.trim() && validSeeds.length && judge && contestants.length && ops.length && !busy

  return (
    <div className="space-y-4">

      {/* Theme */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Тема (уникальный ключ)</label>
        <input
          value={theme} onChange={e => setTheme(e.target.value)}
          placeholder="Объясни RAG джуниору"
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
        />
        <p className="text-[11px] text-gray-600 mt-1">
          Повторный запуск той же темы продолжит существующую ветку.
        </p>
      </div>

      {/* Seed prompts */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-gray-500 uppercase tracking-wide">
            Стартовые промпты — ген 0 ({seeds.length})
          </label>
          <button
            onClick={addSeed}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-800/40 px-2 py-0.5 rounded"
          >
            + Добавить промпт
          </button>
        </div>
        <div className="space-y-2">
          {seeds.map((s, i) => (
            <div key={i} className="relative">
              <textarea
                value={s} onChange={e => updateSeed(i, e.target.value)}
                placeholder={`Вариант промпта ${i + 1}…`}
                rows={3}
                className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
              {seeds.length > 1 && (
                <button
                  onClick={() => removeSeed(i)}
                  className="absolute top-1.5 right-2 text-gray-600 hover:text-rose-400 text-xs"
                  title="Удалить"
                >✕</button>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 mt-1">
          Все варианты оцениваются как поколение 0 и соревнуются в начальной популяции.
        </p>
      </div>

      {/* Generations / per-gen */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Поколения</label>
          <input
            type="number" min={1} max={10} value={generations} onChange={e => setGenerations(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Кандидатов/ген</label>
          <input
            type="number" min={1} max={8} value={perGen} onChange={e => setPerGen(e.target.value)}
            className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Judge */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">
          Судья (также применяет мутации)
        </label>
        <select
          value={judge} onChange={e => setJudge(e.target.value)}
          className="w-full bg-[#0f1117] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-gray-300"
        >
          {models.map(m => <option key={m.name} value={m.name}>{shortName(m.name)}</option>)}
        </select>
        <p className="text-[11px] text-gray-600 mt-1">
          Используйте самую сильную модель — она оценивает И мутирует промпты.
        </p>
      </div>

      {/* Contestant pool */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">
          Пул участников ({contestants.length} выбрано)
        </label>
        <div className="space-y-1 max-h-40 overflow-y-auto border border-[#2a2d3e] rounded-lg p-2">
          {models.map(m => (
            <label key={m.name} className="flex items-center gap-2 text-xs text-gray-400 hover:bg-[#1a1d27] px-1.5 py-1 rounded cursor-pointer">
              <input
                type="checkbox" checked={contestants.includes(m.name)} onChange={() => toggleContestant(m.name)}
                className="accent-indigo-500"
              />
              <span className="truncate">{shortName(m.name)}</span>
              {m.size_gb > 0 && <span className="text-gray-600 ml-auto shrink-0">{m.size_gb}GB</span>}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-600 mt-1">
          Каждый промпт оценивается через round-robin Blind Double-Shuffle между всеми моделями.
        </p>
      </div>

      {/* Mutation operators */}
      <div>
        <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1.5">Операторы мутации</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_OPS.map(op => (
            <button
              key={op}
              onClick={() => toggleOp(op)}
              title={OP_TOOLTIPS[op]}
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
        <p className="text-[11px] text-gray-600 mt-1">Наведите на оператор для описания.</p>
      </div>

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Запуск…" : `🧬 Запустить эволюцию (${validSeeds.length} промпт${validSeeds.length > 1 ? "а" : ""})`}
      </button>
      {result && <p className="text-sm text-gray-400">{result}</p>}
    </div>
  )
}
