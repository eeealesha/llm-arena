"use client"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

interface SearchEntry {
  kind: "tournament" | "article" | "model"
  title: string
  subtitle?: string
  href: string
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/\s+/).filter(Boolean)
}

function scoreEntry(entry: SearchEntry, tokens: string[]): number {
  const hay = `${entry.title} ${entry.subtitle ?? ""}`.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (!hay.includes(t)) return -1
    const idx = hay.indexOf(t)
    score += t.length * (idx === 0 ? 3 : 1)
  }
  if (hay.startsWith(tokens.join(" "))) score += 50
  return score
}

const KIND_META: Record<SearchEntry["kind"], { icon: string; label: string }> = {
  tournament: { icon: "⚔️", label: "Турнир" },
  article:    { icon: "📝", label: "Статья" },
  model:      { icon: "🤖", label: "Модель" },
}

export default function SearchModal() {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState("")
  const [entries, setEntries] = useState<SearchEntry[]>([])
  const [cursor, setCursor]   = useState(0)
  const [loaded, setLoaded]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === "Escape" && open) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (open && !loaded) {
      fetch("/api/search-index")
        .then(r => r.json())
        .then((d: SearchEntry[]) => { setEntries(d); setLoaded(true) })
        .catch(() => {})
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open, loaded])

  const tokens = tokenize(query)
  const results = !tokens.length
    ? entries.slice(0, 12)
    : entries
        .map(e => ({ e, s: scoreEntry(e, tokens) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 20)
        .map(x => x.e)

  function pick(entry: SearchEntry) {
    setOpen(false)
    setQuery("")
    setCursor(0)
    router.push(entry.href)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown")   { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    else if (e.key === "ArrowUp")  { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === "Enter" && results[cursor]) { pick(results[cursor]) }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-[10vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[#13151f] border border-[#2a2d3e] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2a2d3e]">
          <span className="text-gray-500">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setCursor(0) }}
            onKeyDown={onKey}
            placeholder="Поиск турниров, статей, моделей..."
            className="flex-1 bg-transparent outline-none text-white text-sm placeholder:text-gray-600"
          />
          <kbd className="text-xs text-gray-600 border border-[#2a2d3e] rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {!loaded ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">Загрузка...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">Ничего не найдено</div>
          ) : (
            results.map((r, i) => {
              const meta = KIND_META[r.kind]
              return (
                <button
                  key={`${r.kind}-${r.href}`}
                  onClick={() => pick(r)}
                  onMouseEnter={() => setCursor(i)}
                  className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === cursor ? "bg-indigo-600/15" : "hover:bg-[#1a1d27]"
                  }`}
                >
                  <span className="text-base shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-100 font-medium truncate">{r.title}</div>
                    {r.subtitle && <div className="text-xs text-gray-500 truncate">{r.subtitle}</div>}
                  </div>
                  <span className="text-[10px] text-gray-600 uppercase tracking-wider shrink-0 mt-1">{meta.label}</span>
                </button>
              )
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-[#2a2d3e] flex items-center gap-3 text-[11px] text-gray-600">
          <span><kbd className="border border-[#2a2d3e] rounded px-1">↑↓</kbd> навигация</span>
          <span><kbd className="border border-[#2a2d3e] rounded px-1">↵</kbd> открыть</span>
          <span className="ml-auto">{results.length} из {entries.length}</span>
        </div>
      </div>
    </div>
  )
}
