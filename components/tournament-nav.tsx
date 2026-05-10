"use client"
import { useEffect, useState } from "react"

const SECTIONS = [
  { id: "overview",  label: "Обзор" },
  { id: "rankings",  label: "Рейтинг" },
  { id: "bracket",   label: "Сетка" },
  { id: "winner",    label: "Победитель" },
  { id: "patterns",  label: "Паттерны" },
]

export default function TournamentNav({ available }: { available: string[] }) {
  const [active, setActive] = useState(available[0] ?? "overview")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: "-30% 0px -60% 0px" }
    )
    for (const { id } of SECTIONS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  const visible = SECTIONS.filter((s) => available.includes(s.id))
  if (visible.length < 2) return null

  return (
    <nav className="sticky top-14 z-40 bg-[#0f1117]/90 backdrop-blur border-b border-[#1e2130] -mx-4 px-4 mb-6">
      <div className="flex gap-1 overflow-x-auto scrollbar-none py-1.5 max-w-7xl">
        {visible.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              active === s.id
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-gray-500 hover:text-gray-300 hover:bg-[#1e2130]"
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
