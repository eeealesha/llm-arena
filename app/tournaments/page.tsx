import Link from "next/link"
import { loadTournaments } from "@/lib/data"

export default function TournamentsPage() {
  const tournaments = loadTournaments()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Все турниры</h1>
        <p className="text-gray-400 text-sm mt-1">{tournaments.length} турниров</p>
      </div>

      <div className="grid gap-4">
        {tournaments.map((t) => {
          const date = new Date(t.run_at).toLocaleString("ru-RU")
          const winner = t.ranking[0]
          return (
            <Link
              key={t.id}
              href={`/tournament/${t.id}`}
              className="card hover:border-indigo-600/50 hover:bg-[#1e2130] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className={`badge ${
                      t.format === "swiss" || t.format === "iter"
                        ? "bg-indigo-600/20 text-indigo-300"
                        : "bg-amber-600/20 text-amber-300"
                    }`}>{t.format}</span>
                    <span className="badge bg-[#2a2d3e] text-gray-300">
                      судья: {t.judge}
                    </span>
                    <span className="badge bg-[#2a2d3e] text-gray-400">
                      промпт v{t.prompt_version}
                    </span>
                  </div>

                  <p className="text-gray-300 text-sm line-clamp-2">{t.task?.trim() ?? ""}</p>

                  {t.evolved_task && (
                    <p className="text-indigo-400/70 text-xs mt-1 line-clamp-1">
                      → {t.evolved_task?.trim() ?? "".slice(0, 100)}
                    </p>
                  )}
                </div>

                <div className="text-right shrink-0 text-sm">
                  <div className="text-gray-500 text-xs mb-1">{date}</div>
                  <div className="text-gray-400">{t.ranking.length} участников</div>
                  <div className="text-gray-400">{t.match_log.length} матчей</div>
                  <div className="text-indigo-300 font-medium mt-1">
                    🥇 {winner?.model?.split(":")[0]}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
