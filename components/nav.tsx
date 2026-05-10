"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

const links = [
  { href: "/", label: "Лидерборд" },
  { href: "/tournaments", label: "Турниры" },
  { href: "/stats", label: "Статистика" },
  { href: "/compare", label: "SBS" },
  { href: "/blog", label: "Блог" },
  { href: "/team", label: "Редакция" },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav className="border-b border-[#2a2d3e] bg-[#0f1117]/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-8 h-14">
        <Link href="/" className="font-bold text-indigo-400 text-lg tracking-tight">
          ⚔️ LLM Arena
        </Link>
        <div className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                path === l.href
                  ? "bg-indigo-600/20 text-indigo-300"
                  : "text-gray-400 hover:text-gray-100 hover:bg-[#2a2d3e]"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
