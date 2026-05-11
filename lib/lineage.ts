// Prompt-evolution data types — mirrors runner/lineage.py JSON shape.

export const CRITERIA = ["engagement", "informativeness", "accuracy", "originality"] as const
export type Criterion = typeof CRITERIA[number]

export interface PromptFitness {
  engagement:      number
  informativeness: number
  accuracy:        number
  originality:     number
  avg_score:       number
  n_evals:         number
}

export interface PromptNode {
  id: string
  text: string
  parent_id: string | null
  mutation_op: string
  generation: number
  fitness: PromptFitness
  is_pareto: boolean
  sample_outputs?: Record<string, string>
  feedback_summary?: string
  created_at: string
}

export interface Lineage {
  theme_slug: string
  theme_label: string
  created_at: string
  updated_at: string
  prompts: PromptNode[]
  generations: { gen: number; added: string[]; ts: string }[]
}

export interface LineageSummary {
  theme_slug:  string
  theme_label: string
  updated_at:  string | null
  prompts:     number
  generations: number
  best_score:  number | null
}

// ── Tree layout ──────────────────────────────────────────────────────────
export interface LayoutNode {
  node: PromptNode
  x: number      // horizontal position (column)
  y: number      // vertical position (generation)
  children: LayoutNode[]
}

/**
 * Position prompts in a tidy generation-layered tree.
 * y-axis = generation (depth). x-axis = compact horizontal slot.
 */
export function layoutLineage(lineage: Lineage): {
  nodes: Array<{ node: PromptNode; x: number; y: number }>
  edges: Array<{ from: string; to: string; op: string }>
  width: number
  height: number
} {
  const byParent = new Map<string | null, PromptNode[]>()
  for (const p of lineage.prompts) {
    const arr = byParent.get(p.parent_id) ?? []
    arr.push(p)
    byParent.set(p.parent_id, arr)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
  }

  // Reingold–Tilford-ish: assign x by post-order DFS, normalised per generation row width.
  const positions = new Map<string, { x: number; y: number }>()
  let leafCounter = 0

  function assign(node: PromptNode): { left: number; right: number } {
    const kids = byParent.get(node.id) ?? []
    if (!kids.length) {
      const x = leafCounter++
      positions.set(node.id, { x, y: node.generation })
      return { left: x, right: x }
    }
    const ranges = kids.map(assign)
    const left  = ranges[0].left
    const right = ranges[ranges.length - 1].right
    positions.set(node.id, { x: (left + right) / 2, y: node.generation })
    return { left, right }
  }

  // Roots = prompts with no parent_id (may be more than one if a theme was re-seeded)
  const roots = byParent.get(null) ?? []
  roots.forEach(assign)

  const maxGen   = Math.max(0, ...lineage.prompts.map(p => p.generation))
  const maxX     = leafCounter - 1

  return {
    nodes: lineage.prompts.map(p => {
      const pos = positions.get(p.id) ?? { x: 0, y: p.generation }
      return { node: p, x: pos.x, y: pos.y }
    }),
    edges: lineage.prompts
      .filter(p => p.parent_id)
      .map(p => ({ from: p.parent_id!, to: p.id, op: p.mutation_op })),
    width: Math.max(1, maxX),
    height: Math.max(1, maxGen),
  }
}

export const OPERATOR_META: Record<string, { label: string; color: string; icon: string }> = {
  seed:        { label: "Seed",        color: "#94a3b8", icon: "🌱" },
  zero_order:  { label: "Zero-order",  color: "#60a5fa", icon: "🎲" },
  first_order: { label: "First-order", color: "#a78bfa", icon: "✏️" },
  hyper:       { label: "Hyper-mut",   color: "#f472b6", icon: "🌀" },
  lamarckian:  { label: "Lamarckian",  color: "#fbbf24", icon: "🧬" },
}
