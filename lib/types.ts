export interface CriteriaScores extends Record<string, number> {
  engagement: number
  informativeness: number
  accuracy: number
  originality: number
}

export interface TournamentRanking {
  rank: number
  model: string
  // TrueSkill (new format)
  ts_score?: number
  mu?: number
  sigma?: number
  // ELO (old format)
  elo?: number
  W: number
  L: number
  D: number
  bye: number
  criteria?: CriteriaScores
}

export interface MatchLog {
  round: number
  match: number
  A: string
  B: string
  verdict: "A" | "B" | "DRAW"
  reasoning: string
  scores_a?: CriteriaScores
  scores_b?: CriteriaScores
  ts_a?: number
  ts_b?: number
  // old format
  elo_a?: number
  elo_b?: number
}

export interface Tournament {
  id: string               // derived from filename
  filename: string
  iteration: number
  run_at: string
  task: string
  evolved_task?: string
  judge: string
  ranking: TournamentRanking[]
  posts: Record<string, string>
  winner_critique?: string
  winner_rewrite?: string
  match_log: MatchLog[]
  reasoning_summary?: string
  criteria_avgs?: Record<string, CriteriaScores>
  // helpers
  format: "swiss" | "roundRobin" | "final" | "iter" | "unknown"
  prompt_version: number
}

export interface GlobalModelStats {
  model: string
  tournaments: number
  avg_rank: number
  best_rank: number
  wins: number
  losses: number
  draws: number
  avg_ts?: number
  avg_elo?: number
  criteria?: CriteriaScores
}

export interface Vote {
  tournament_id: string
  post_a_model: string
  post_b_model: string
  winner: "A" | "B" | "SKIP"
}
