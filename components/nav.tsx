"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const links = [
  { href: "/",           label: "Лидерборд",  sub: "рейтинг всех моделей" },
  { href: "/tournaments", label: "Турниры",    sub: "история матчей" },
  { href: "/stats",      label: "Статистика", sub: "размер vs качество" },
  { href: "/compare",    label: "SBS",        sub: "сравни сам" },
  { href: "/blog",       label: "Блог",       sub: "статьи редакции" },
  { href: "/team",       label: "Редакция",   sub: "кто пишет" },
]

export default function Nav() {
  const path = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="border-b border-[#2a2d3e] bg-[#0f1117]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-6 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0" onClick={() => setMenuOpen(false)}>
          <span className="text-lg">⚔️</span>
          <span className="font-bold text-indigo-400 text-base tracking-tight">LLM Arena</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex gap-0.5">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`group relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-600/20 text-indigo-300"
                    : "text-gray-400 hover:text-gray-100 hover:bg-[#2a2d3e]"
                }`}
              >
                {l.label}
                {/* Tooltip on hover */}
                <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded-lg bg-[#1a1d27] border border-[#2a2d3e] text-gray-400 text-xs px-2 py-1 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-xl z-50">
                  {l.sub}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Right side — search + about + mobile toggle */}
        <div className="ml-auto flex items-center gap-2">
          {/* Search trigger (cmd+K) */}
          <button
            onClick={() => {
              const e = new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true })
              window.dispatchEvent(e)
            }}
            className="hidden sm:flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors border border-[#2a2d3e] hover:border-[#3a3d4e] rounded-lg px-2.5 py-1"
            aria-label="Поиск"
          >
            <span>🔍</span>
            <span>Поиск</span>
            <kbd className="border border-[#2a2d3e] rounded px-1 text-[10px] text-gray-600">⌘K</kbd>
          </button>

          {/* "What is this" tooltip */}
          <div className="hidden md:block relative group">
            <button className="text-gray-500 hover:text-gray-300 transition-colors text-sm flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[#2a2d3e]">
              <span className="text-xs">?</span>
              <span className="text-xs">О проекте</span>
            </button>
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-[#1a1d27] border border-[#2a2d3e] p-4 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-2xl z-50 text-sm">
              <div className="font-semibold text-white mb-2">Что такое LLM Arena?</div>
              <p className="text-gray-400 text-xs leading-relaxed">
                Открытый бенчмарк бесплатных языковых моделей. Каждый турнир — это
                швейцарская система, где модели пишут посты, а независимый судья-LLM
                оценивает их по 4 критериям: вовлечённость, информативность, точность,
                оригинальность.
              </p>
              <div className="mt-3 pt-3 border-t border-[#2a2d3e] grid grid-cols-2 gap-2 text-xs text-gray-500">
                <span>⚔️ TrueSkill рейтинг</span>
                <span>📊 Мультикритерии</span>
                <span>🔄 Эволюция промптов</span>
                <span>✍️ Редакция LLM</span>
              </div>
            </div>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden text-gray-400 hover:text-gray-200 p-1.5 rounded-lg hover:bg-[#2a2d3e] transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="w-5 flex flex-col gap-1">
              <span className={`block h-0.5 bg-current rounded transition-all ${menuOpen ? "rotate-45 translate-y-1.5" : ""}`} />
              <span className={`block h-0.5 bg-current rounded transition-all ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 bg-current rounded transition-all ${menuOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#2a2d3e] px-4 py-3 space-y-1">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:text-gray-100 hover:bg-[#2a2d3e]"
                }`}
              >
                <span className="font-medium">{l.label}</span>
                <span className="text-xs text-gray-500">{l.sub}</span>
              </Link>
            )
          })}
          <div className="pt-3 mt-3 border-t border-[#2a2d3e] text-xs text-gray-600 leading-relaxed px-1">
            Открытый бенчмарк LLM · Швейцарский турнир · TrueSkill рейтинг
          </div>
        </div>
      )}
    </nav>
  )
}
