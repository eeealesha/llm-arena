import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"

export const runtime = "edge"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const title    = (searchParams.get("title") ?? "LLM Arena").slice(0, 140)
  const subtitle = (searchParams.get("subtitle") ?? "Открытый бенчмарк бесплатных LLM").slice(0, 160)
  const kind     = searchParams.get("kind") ?? "site"   // site | tournament | article
  const winner   = searchParams.get("winner")

  const accent =
    kind === "tournament" ? "#10b981" :
    kind === "article"    ? "#6366f1" :
                            "#a78bfa"

  const kindLabel =
    kind === "tournament" ? "⚔️  ТУРНИР" :
    kind === "article"    ? "✍️  СТАТЬЯ" :
                            "LLM ARENA"

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f1117 0%, #181b29 100%)",
          padding: "70px 80px",
          color: "#e5e7eb",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ fontSize: 44 }}>⚔️</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#a5b4fc", letterSpacing: -0.5 }}>
              LLM Arena
            </div>
          </div>
          <div style={{
            fontSize: 18, letterSpacing: 3, color: accent, fontWeight: 600,
            border: `2px solid ${accent}33`, padding: "6px 14px", borderRadius: 8,
            background: `${accent}1a`,
          }}>
            {kindLabel}
          </div>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{
            fontSize: title.length > 60 ? 50 : 64,
            fontWeight: 800, color: "#f9fafb",
            lineHeight: 1.15, letterSpacing: -1,
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 26, color: "#94a3b8", lineHeight: 1.4 }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 20, color: "#6b7280" }}>onlyanalyst.ru</div>
          {winner && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22 }}>
              <span>🏆</span>
              <span style={{ color: "#fbbf24", fontWeight: 600 }}>{winner.slice(0, 40)}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
