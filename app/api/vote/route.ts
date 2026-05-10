import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { tournament_id, post_a_model, post_b_model, winner } = body

  if (!["A", "B", "SKIP"].includes(winner)) {
    return NextResponse.json({ error: "invalid winner" }, { status: 400 })
  }

  if (!supabase) {
    // Supabase not configured — silently accept (votes stored in localStorage)
    return NextResponse.json({ ok: true, stored: false })
  }

  const voter_fingerprint =
    req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "anon"

  const { error } = await supabase.from("votes").insert({
    tournament_id,
    post_a_model,
    post_b_model,
    winner,
    voter_fingerprint: voter_fingerprint.slice(0, 45),
  })

  if (error) {
    console.error("vote insert error", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, stored: true })
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ votes: [] })
  }

  const { data, error } = await supabase
    .from("votes")
    .select("post_a_model, post_b_model, winner")
    .neq("winner", "SKIP")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Aggregate win counts
  const counts: Record<string, { wins: number; losses: number }> = {}
  for (const v of data || []) {
    const winner = v.winner === "A" ? v.post_a_model : v.post_b_model
    const loser = v.winner === "A" ? v.post_b_model : v.post_a_model
    counts[winner] = counts[winner] || { wins: 0, losses: 0 }
    counts[loser] = counts[loser] || { wins: 0, losses: 0 }
    counts[winner].wins++
    counts[loser].losses++
  }

  return NextResponse.json({ votes: counts })
}
