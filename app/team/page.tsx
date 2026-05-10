export const dynamic = "force-dynamic"
import { loadTournaments } from "@/lib/data"
import { ROLE_LABELS } from "@/lib/articles"
import Link from "next/link"
import { modelSlug } from "@/lib/data"

export default function TeamPage() {
  const tournaments = loadTournaments()
  // Use the most recent tournament that has criteria_avgs
  const t = tournaments.find((t) => t.criteria_avgs && t.ranking.length > 0)

  if (!t || !t.criteria_avgs) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Редакция</h1>
        <div className="card text-center py-16 text-gray-500">
          <div className="text-4xl mb-3">👥</div>
          <div>Нет данных о критериях — запусти турнир с JUDGE_RUBRIC</div>
        </div>
      </div>
    )
  }

  const ranked = t.ranking
  const criteria_avgs = t.criteria_avgs!
  const models = ranked.map((r) => r.model).filter((m) => m in criteria_avgs)

  if (!models.length) return null

  const chief_editor = ranked[0].model
  const editor       = models.reduce((a, b) => criteria_avgs[a].accuracy >= criteria_avgs[b].accuracy ? a : b)
  const storyteller  = models.reduce((a, b) =>
    (criteria_avgs[a].engagement + criteria_avgs[a].originality) >=
    (criteria_avgs[b].engagement + criteria_avgs[b].originality) ? a : b)
  const analyst      = models.reduce((a, b) =>
    (criteria_avgs[a].informativeness + criteria_avgs[a].accuracy) >=
    (criteria_avgs[b].informativeness + criteria_avgs[b].accuracy) ? a : b)
  const planner      = models.reduce((a, b) => criteria_avgs[a].originality >= criteria_avgs[b].originality ? a : b)

  const roleMap: Record<string, string[]> = {}
  for (const [role, model] of [
    ["chief_editor", chief_editor],
    ["editor", editor],
    ["storyteller", storyteller],
    ["analyst", analyst],
    ["planner", planner],
  ] as [string, string][]) {
    if (!roleMap[model]) roleMap[model] = []
    roleMap[model].push(role)
  }

  const featuredOrder = [chief_editor, storyteller, analyst, editor, planner]
  const seen = new Set<string>()
  const featured = featuredOrder.filter((m) => { if (seen.has(m)) return false; seen.add(m); return true })

  const date = new Date(t.run_at).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Редакция</h1>
        <p className="text-gray-400 text-sm mt-1">
          Роли назначены по итогам турнира от {date} ·{" "}
          <Link href={`/tournament/${t.id}`} className="text-indigo-400 hover:underline">
            {t.id.slice(-20)}
          </Link>
        </p>
      </div>

      {/* Chief editor highlight */}
      <div className="card border-amber-600/30 bg-amber-950/10">
        <div className="flex items-start gap-4">
          <div className="text-4xl">👑</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-amber-400 uppercase tracking-wide mb-1">
              Выпускающий редактор
            </div>
            <Link
              href={`/model/${modelSlug(chief_editor)}`}
              className="text-xl font-bold text-white hover:text-amber-300 transition-colors"
            >
              {chief_editor}
            </Link>
            <p className="text-gray-400 text-sm mt-1">{ROLE_LABELS.chief_editor.desc}</p>
            <CriteriaBar scores={criteria_avgs[chief_editor]} />
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">TrueSkill</div>
            <div className="text-2xl font-mono text-amber-300 font-bold">
              {ranked[0].ts_score?.toFixed(1) ?? ranked[0].elo?.toFixed(0) ?? "—"}
            </div>
            <div className="text-xs text-gray-500">#{ranked[0].rank}</div>
          </div>
        </div>
      </div>

      {/* Verified by */}
      <div className="card border-emerald-800/30 bg-emerald-950/10 flex items-center gap-4">
        <div className="text-3xl">🧑‍💼</div>
        <div>
          <div className="font-semibold text-white">Алексей Гавриlov</div>
          <div className="text-sm text-gray-400">Главный редактор · Проверяет и одобряет все публикации</div>
        </div>
        <div className="ml-auto">
          <span className="badge bg-emerald-900/40 text-emerald-400 text-sm">✓ Верификатор</span>
        </div>
      </div>

      {/* Role cards */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Авторский состав</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {featured.map((model) => {
            const roles = roleMap[model] ?? []
            const r = ranked.find((x) => x.model === model)
            const scores = criteria_avgs[model]

            return (
              <div key={model} className="card">
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {roles.map((role) => (
                    <span
                      key={role}
                      className="badge bg-indigo-600/20 text-indigo-300 text-xs"
                    >
                      {ROLE_LABELS[role]?.icon} {ROLE_LABELS[role]?.ru ?? role}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/model/${modelSlug(model)}`}
                  className="font-semibold text-gray-100 hover:text-indigo-300 transition-colors block truncate"
                  title={model}
                >
                  {model}
                </Link>
                {roles[0] && (
                  <p className="text-gray-500 text-xs mt-1 leading-relaxed">
                    {ROLE_LABELS[roles[0]]?.desc}
                  </p>
                )}
                <CriteriaBar scores={scores} className="mt-3" />
                {r && (
                  <div className="mt-3 flex gap-3 text-xs text-gray-500">
                    <span>Ранг #{r.rank}</span>
                    <span>TS: <span className="text-indigo-300">{r.ts_score?.toFixed(1) ?? "—"}</span></span>
                    <span className="text-emerald-400">{r.W}W</span>
                    <span className="text-rose-400">{r.L}L</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Full criteria table */}
      <details className="card border-[#2a2d3e]">
        <summary className="cursor-pointer text-gray-400 text-sm font-medium hover:text-gray-200 transition-colors">
          Полная таблица критериев ({ranked.length} моделей)
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Модель</th>
                <th>Роли</th>
                <th>Eng</th><th>Inf</th><th>Acc</th><th>Ori</th>
                <th>TS</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const scores = criteria_avgs[r.model]
                const roles = roleMap[r.model] ?? []
                if (!scores) return null
                return (
                  <tr key={r.model}>
                    <td className="font-mono text-gray-500 text-center">{r.rank}</td>
                    <td>
                      <Link
                        href={`/model/${modelSlug(r.model)}`}
                        className="text-indigo-300 hover:underline text-sm"
                      >
                        {r.model}
                      </Link>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {roles.map((role) => (
                          <span key={role} className="text-base" title={ROLE_LABELS[role]?.ru}>
                            {ROLE_LABELS[role]?.icon}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="font-mono text-sm">{scores.engagement.toFixed(1)}</td>
                    <td className="font-mono text-sm">{scores.informativeness.toFixed(1)}</td>
                    <td className="font-mono text-sm">{scores.accuracy.toFixed(1)}</td>
                    <td className="font-mono text-sm">{scores.originality.toFixed(1)}</td>
                    <td className="font-mono text-indigo-300">{r.ts_score?.toFixed(1) ?? "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function CriteriaBar({ scores, className = "" }: {
  scores: Record<string, number>
  className?: string
}) {
  const keys = ["engagement", "informativeness", "accuracy", "originality"]
  const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899"]
  return (
    <div className={`space-y-1 ${className}`}>
      {keys.map((k, i) => (
        <div key={k} className="flex items-center gap-2">
          <span className="text-gray-500 text-xs w-5">{criteriaLabel(k)}</span>
          <div className="flex-1 bg-[#2a2d3e] rounded-full h-1.5">
            <div
              className="h-1.5 rounded-full transition-all"
              style={{ width: `${(scores[k] ?? 0) * 20}%`, backgroundColor: colors[i] }}
            />
          </div>
          <span className="text-xs font-mono text-gray-400 w-6 text-right">
            {(scores[k] ?? 0).toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  )
}

function criteriaLabel(key: string) {
  return { engagement: "Eng", informativeness: "Inf", accuracy: "Acc", originality: "Ori" }[key] ?? key
}
