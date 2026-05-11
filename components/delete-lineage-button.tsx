"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function DeleteLineageButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handle() {
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/runner/lineage/${encodeURIComponent(slug)}`, { method: "DELETE" })
      if (r.ok) {
        router.push("/prompts")
        router.refresh()
      } else {
        const d = await r.json().catch(() => ({}))
        alert(`Не удалось удалить: ${d.error ?? r.status}`)
        setBusy(false)
      }
    } catch (e) {
      alert(`Ошибка: ${e}`)
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handle}
      disabled={busy}
      className={`text-xs px-2.5 py-1 rounded-lg border transition-colors shrink-0 ${
        confirming
          ? "border-rose-700/60 bg-rose-950/30 text-rose-300"
          : "border-[#2a2d3e] text-gray-500 hover:text-rose-400 hover:border-rose-800/40"
      }`}
      title={`Удалить ветку "${label}" и начать заново`}
    >
      {busy ? "Удаляю..." : confirming ? "Точно удалить? Нажми ещё раз" : "🗑 Удалить ветку"}
    </button>
  )
}
