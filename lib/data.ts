import fs from "fs"
import path from "path"
import type { Tournament, GlobalModelStats, CriteriaScores } from "./types"

const DATA_DIR = path.join(process.cwd(), "data", "tournaments")

function detectFormat(filename: string): Tournament["format"] {
  if (filename.includes("roundRobin")) return "roundRobin"
  if (filename.includes("swiss")) return "swiss"
  if (filename.includes("final")) return "final"
  if (filename.includes("iter")) return "iter"
  return "unknown"
}

function detectPromptVersion(filename: string): number {
  const m = filename.match(/iter(\d+)/)
  return m ? parseInt(m[1]) : 1
}

export function loadTournaments(): Tournament[] {
  if (!fs.existsSync(DATA_DIR)) return []

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()

  const tournaments: Tournament[] = []

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8")
      const data = JSON.parse(raw)
      // Skip non-tournament files
      if (!data.ranking || !Array.isArray(data.ranking)) continue

      const id = file.replace(".json", "")
      // Normalise old format (original_task / evolved_prompt) to new field names
      const task: string = data.task ?? data.original_task ?? ""
      const evolved_task: string = data.evolved_task ?? data.evolved_prompt ?? ""
      tournaments.push({
        ...data,
        id,
        filename: file,
        task,
        evolved_task,
        format: data.format ?? detectFormat(data.tournament ?? file),
        prompt_version: data.prompt_version ?? detectPromptVersion(file),
        match_log: data.match_log || [],
        posts: data.posts || {},
      })
    } catch {
      // skip malformed files
    }
  }

  return tournaments.sort(
    (a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime()
  )
}

export function getTournament(id: string): Tournament | undefined {
  return loadTournaments().find((t) => t.id === id)
}

export function aggregateLeaderboard(
  tournaments: Tournament[]
): GlobalModelStats[] {
  const stats: Record<string, GlobalModelStats> = {}
  const criteriaAccum: Record<string, { sum: CriteriaScores; count: number }> =
    {}

  for (const t of tournaments) {
    for (const r of t.ranking) {
      const m = r.model
      if (!stats[m]) {
        stats[m] = {
          model: m,
          tournaments: 0,
          avg_rank: 0,
          best_rank: Infinity,
          wins: 0,
          losses: 0,
          draws: 0,
        }
      }
      const s = stats[m]
      s.tournaments++
      s.avg_rank = (s.avg_rank * (s.tournaments - 1) + r.rank) / s.tournaments
      if (r.rank < s.best_rank) s.best_rank = r.rank
      s.wins += r.W || 0
      s.losses += r.L || 0
      s.draws += r.D || 0

      if (r.ts_score !== undefined) {
        s.avg_ts = ((s.avg_ts ?? 0) * (s.tournaments - 1) + r.ts_score) / s.tournaments
      }
      if (r.elo !== undefined) {
        s.avg_elo = ((s.avg_elo ?? 0) * (s.tournaments - 1) + r.elo) / s.tournaments
      }

      if (r.criteria) {
        if (!criteriaAccum[m]) {
          criteriaAccum[m] = {
            sum: { engagement: 0, informativeness: 0, accuracy: 0, originality: 0 },
            count: 0,
          }
        }
        const acc = criteriaAccum[m]
        acc.count++
        for (const k of Object.keys(r.criteria) as (keyof CriteriaScores)[]) {
          acc.sum[k] += r.criteria[k]
        }
      }
    }
  }

  for (const [m, acc] of Object.entries(criteriaAccum)) {
    stats[m].criteria = {
      engagement: +(acc.sum.engagement / acc.count).toFixed(2),
      informativeness: +(acc.sum.informativeness / acc.count).toFixed(2),
      accuracy: +(acc.sum.accuracy / acc.count).toFixed(2),
      originality: +(acc.sum.originality / acc.count).toFixed(2),
    }
  }

  return Object.values(stats).sort((a, b) => a.avg_rank - b.avg_rank)
}

export function getModelHistory(
  tournaments: Tournament[],
  model: string
): Array<{ tournament: Tournament; ranking: Tournament["ranking"][0] }> {
  const history = []
  for (const t of tournaments) {
    const r = t.ranking.find((r) => r.model === model)
    if (r) history.push({ tournament: t, ranking: r })
  }
  return history.sort(
    (a, b) =>
      new Date(a.tournament.run_at).getTime() -
      new Date(b.tournament.run_at).getTime()
  )
}

export function getAllModels(tournaments: Tournament[]): string[] {
  const models = new Set<string>()
  for (const t of tournaments) {
    for (const r of t.ranking) models.add(r.model)
  }
  return Array.from(models).sort()
}

export function modelSlug(model: string): string {
  return encodeURIComponent(model.replace(/[:/]/g, "_"))
}

export function slugToModel(slug: string, allModels: string[]): string | undefined {
  const decoded = decodeURIComponent(slug)
  return allModels.find(
    (m) => m.replace(/[:/]/g, "_") === decoded || m === decoded
  )
}
