export const dynamic = "force-dynamic"
import { loadTournaments, aggregateLeaderboard } from "@/lib/data"
import { getModelMeta } from "@/lib/models"
import { SizeVsPerformanceChart, EfficiencyChart, WinRateChart } from "@/components/stats-charts"

export default function StatsPage() {
  const tournaments = loadTournaments()
  const leaderboard = aggregateLeaderboard(tournaments)
  const modelMeta = getModelMeta()

  // Build enriched dataset joining leaderboard + model sizes
  const data = leaderboard
    .map((m) => {
      const meta = modelMeta.find((mm) => mm.name === m.model)
      const size_gb = meta?.size_gb ?? null
      const total = m.wins + m.losses + m.draws
      const win_rate = total ? (m.wins / total) * 100 : 0
      const ts_score = m.avg_ts ?? (m.avg_elo ? m.avg_elo - 1000 : 0)
      const efficiency = size_gb && size_gb > 0
        ? ts_score / Math.log(size_gb + 1)
        : null
      return {
        model: m.model,
        short: m.model.split(":")[0].split("/").pop()?.slice(0, 18) ?? m.model,
        size_gb,
        avg_rank: m.avg_rank,
        win_rate,
        ts_score,
        efficiency,
        tournaments: m.tournaments,
      }
    })

  const withSize = data.filter((d) => d.size_gb !== null && d.ts_score !== 0) as Array<{
    model: string; short: string; size_gb: number; avg_rank: number
    win_rate: number; ts_score: number; efficiency: number; tournaments: number
  }>

  // Size buckets analysis
  const buckets = [
    { label: "< 10 GB",     min: 0,   max: 10  },
    { label: "10–50 GB",    min: 10,  max: 50  },
    { label: "50–150 GB",   min: 50,  max: 150 },
    { label: "> 150 GB",    min: 150, max: Infinity },
  ]
  const bucketStats = buckets.map((b) => {
    const models = withSize.filter((d) => d.size_gb >= b.min && d.size_gb < b.max)
    if (!models.length) return null
    return {
      label: b.label,
      count: models.length,
      avg_ts: models.reduce((s, m) => s + m.ts_score, 0) / models.length,
      avg_win: models.reduce((s, m) => s + m.win_rate, 0) / models.length,
      avg_eff: models.reduce((s, m) => s + (m.efficiency ?? 0), 0) / models.length,
      top: models.sort((a, b) => b.ts_score - a.ts_score)[0]?.model,
    }
  }).filter(Boolean)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Статистика</h1>
        <p className="text-gray-400 text-sm mt-1">
          Размер модели vs качество, эффективность (score/log(GB)), winrate
        </p>
      </div>

      {/* Size buckets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {bucketStats.map((b) => b && (
          <div key={b.label} className="card text-center">
            <div className="text-xs text-gray-500 mb-2">{b.label}</div>
            <div className="text-2xl font-bold text-indigo-400">{b.count}</div>
            <div className="text-xs text-gray-500 mt-0.5">моделей</div>
            <div className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Ср. TS</span>
                <span className="text-gray-300">{b.avg_ts.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Ср. win%</span>
                <span className="text-emerald-400">{b.avg_win.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Эффект.</span>
                <span className="text-amber-400">{b.avg_eff.toFixed(1)}</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-600 truncate" title={b.top}>
              🏆 {b.top?.split(":")[0]}
            </div>
          </div>
        ))}
      </div>

      {/* Scatter: size vs performance */}
      {withSize.length > 0 ? (
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Размер vs TrueSkill</h2>
          <p className="text-gray-500 text-xs mb-4">
            Ось X — размер модели (логарифмическая шкала). Размер кружка = количество турниров.
          </p>
          <SizeVsPerformanceChart data={withSize} />
        </div>
      ) : (
        <div className="card text-center text-gray-500 py-12">
          Нет данных о размерах моделей — добавь <code>data/models.json</code>
        </div>
      )}

      {/* Efficiency */}
      {withSize.length > 0 && (
        <div className="card">
          <h2 className="text-base font-semibold mb-1">Эффективность = TS / log(GB)</h2>
          <p className="text-gray-500 text-xs mb-4">
            Насколько хорош результат с учётом размера. Маленькая модель с высоким скором → высокая эффективность.
          </p>
          <EfficiencyChart data={withSize} />
        </div>
      )}

      {/* Winrate */}
      <div className="card">
        <h2 className="text-base font-semibold mb-1">Winrate по моделям</h2>
        <p className="text-gray-500 text-xs mb-4">Процент побед во всех матчах всех турниров.</p>
        <WinRateChart data={data as any} />
      </div>

      {/* Full table */}
      <div className="card">
        <h2 className="text-base font-semibold mb-4">Полная таблица</h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Модель</th>
                <th>Размер GB</th>
                <th>TS score</th>
                <th>Ср. ранг</th>
                <th>Winrate</th>
                <th>Эффект.</th>
                <th>Турниры</th>
              </tr>
            </thead>
            <tbody>
              {data
                .sort((a, b) => b.ts_score - a.ts_score)
                .map((m, i) => (
                  <tr key={m.model}>
                    <td className="text-gray-500 font-mono">{i + 1}</td>
                    <td className="font-medium text-gray-200">{m.model}</td>
                    <td className="font-mono text-gray-400">{m.size_gb?.toFixed(0) ?? "—"}</td>
                    <td className="font-mono text-indigo-300">{m.ts_score.toFixed(1)}</td>
                    <td className="font-mono">{m.avg_rank.toFixed(1)}</td>
                    <td className={`font-mono ${m.win_rate >= 60 ? "text-emerald-400" : m.win_rate >= 40 ? "text-gray-300" : "text-rose-400"}`}>
                      {m.win_rate.toFixed(0)}%
                    </td>
                    <td className="font-mono text-amber-400">
                      {m.efficiency?.toFixed(1) ?? "—"}
                    </td>
                    <td className="font-mono text-gray-500">{m.tournaments}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
