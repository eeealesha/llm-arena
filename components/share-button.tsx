"use client"
import { useState } from "react"

export default function ShareButton({
  title,
  text,
  path,
  className = "",
}: {
  title: string
  text?: string
  path: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handle() {
    const url = typeof window !== "undefined" ? window.location.origin + path : path
    const data: ShareData = { title, url, text: text ?? title }
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      try { await navigator.share(data); return } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <button
      onClick={handle}
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-[#2a2d3e] text-gray-400 hover:text-gray-200 hover:border-indigo-700/50 transition-colors ${className}`}
    >
      {copied ? <><span>✓</span><span>Скопировано</span></> : <><span>🔗</span><span>Поделиться</span></>}
    </button>
  )
}
