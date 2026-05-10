import { loadTournaments } from "@/lib/data"
import SBSVoter from "@/components/sbs-voter"

export default function ComparePage() {
  const tournaments = loadTournaments().filter(
    (t) => Object.keys(t.posts || {}).length >= 2
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">SBS Голосование</h1>
        <p className="text-gray-400 text-sm mt-1">
          Сравни два поста вслепую — авторство раскрывается после голосования.
          Твои голоса участвуют в открытом бенчмарке.
        </p>
      </div>
      <SBSVoter tournaments={tournaments} />
    </div>
  )
}
