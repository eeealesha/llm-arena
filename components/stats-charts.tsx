"use client"
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, BarChart, Bar, Legend,
} from "recharts"

interface ModelPoint {
  model: string
  short: string
  size_gb: number
  avg_rank: number
  win_rate: number
  ts_score: number
  efficiency: number // ts_score / log(size_gb+1)
  tournaments: number
}

const COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981",
  "#3b82f6","#ef4444","#14b8a6","#f97316","#a855f7",
]

function CustomDot(props: any) {
  const { cx, cy, payload, fill } = props
  const r = Math.max(5, Math.min(14, 5 + payload.tournaments * 2))
  return (
    <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.8} stroke="#1a1d27" strokeWidth={1.5} />
  )
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d: ModelPoint = payload[0].payload
  return (
    <div className="bg-[#1a1d27] border border-[#2a2d3e] rounded-xl p-3 text-sm shadow-xl">
      <div className="font-semibold text-white mb-1.5">{d.model}</div>
      <div className="space-y-0.5 text-gray-400">
        <div>Размер: <span className="text-gray-200">{d.size_gb} GB</span></div>
        <div>TS скор: <span className="text-indigo-300">{d.ts_score.toFixed(1)}</span></div>
        <div>Ср. ранг: <span className="text-gray-200">#{d.avg_rank.toFixed(1)}</span></div>
        <div>Winrate: <span className="text-emerald-300">{d.win_rate.toFixed(0)}%</span></div>
        <div>Эффективность: <span className="text-amber-300">{d.efficiency.toFixed(1)}</span></div>
        <div>Турниров: <span className="text-gray-200">{d.tournaments}</span></div>
      </div>
    </div>
  )
}

export function SizeVsPerformanceChart({ data }: { data: ModelPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={380}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" />
        <XAxis
          dataKey="size_gb"
          name="Размер (GB)"
          type="number"
          scale="log"
          domain={["auto", "auto"]}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          label={{ value: "Размер модели (GB, log scale)", position: "insideBottom", offset: -10, fill: "#6b7280", fontSize: 12 }}
        />
        <YAxis
          dataKey="ts_score"
          name="TrueSkill"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          label={{ value: "TrueSkill score", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#2a2d3e" }} />
        <Scatter data={data} shape={<CustomDot />}>
          {data.map((d, i) => (
            <Cell key={d.model} fill={COLORS[i % COLORS.length]} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}

export function EfficiencyChart({ data }: { data: ModelPoint[] }) {
  const sorted = [...data].sort((a, b) => b.efficiency - a.efficiency).slice(0, 15)
  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="short"
          width={110}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3e", borderRadius: 8, color: "#e2e8f0" }}
          formatter={(v: number) => [v.toFixed(2), "TS / log(GB)"]}
        />
        <Bar dataKey="efficiency" radius={[0, 4, 4, 0]}>
          {sorted.map((d, i) => (
            <Cell key={d.model} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function WinRateChart({ data }: { data: ModelPoint[] }) {
  const sorted = [...data]
    .filter((d) => d.tournaments > 0)
    .sort((a, b) => b.win_rate - a.win_rate)
    .slice(0, 15)
  return (
    <ResponsiveContainer width="100%" height={380}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3e" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fill: "#6b7280", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="short"
          width={110}
          tick={{ fill: "#9ca3af", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#1a1d27", border: "1px solid #2a2d3e", borderRadius: 8, color: "#e2e8f0" }}
          formatter={(v: number) => [v.toFixed(1) + "%", "Winrate"]}
        />
        <Bar dataKey="win_rate" radius={[0, 4, 4, 0]}>
          {sorted.map((d, i) => (
            <Cell key={d.model} fill={d.win_rate >= 60 ? "#10b981" : d.win_rate >= 40 ? "#6366f1" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
