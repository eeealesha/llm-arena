"use client"
import { useEffect, useState } from "react"

export default function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    // Sync state with the class already set by the inline script
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    try { localStorage.setItem("theme", next ? "dark" : "light") } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors text-sm flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)]"
      title={dark ? "Светлая тема" : "Тёмная тема"}
      aria-label={dark ? "Переключить на светлую тему" : "Переключить на тёмную тему"}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  )
}
