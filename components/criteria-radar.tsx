"use client"
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import type { CriteriaScores } from "@/lib/types"

const LABELS: Record<keyof CriteriaScores, string> = {
  engagement: "Вовлечённость",
  informativeness: "Информативность",
  accuracy: "Точность",
  originality: "Оригинальность",
}

export default function CriteriaRadar({
  criteria,
  color = "#6366f1",
}: {
  criteria: CriteriaScores
  color?: string
}) {
  const data = (Object.keys(LABELS) as (keyof CriteriaScores)[]).map((k) => ({
    subject: LABELS[k],
    value: criteria[k],
    fullMark: 5,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#2a2d3e" />
        <PolarAngleAxis
          dataKey="subject"
          tick={{ fill: "#9ca3af", fontSize: 12 }}
        />
        <Radar
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            background: "#1a1d27",
            border: "1px solid #2a2d3e",
            borderRadius: 8,
            color: "#e2e8f0",
          }}
          formatter={(v: number) => [v.toFixed(2), "Score"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
