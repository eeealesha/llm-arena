import { NextRequest, NextResponse } from "next/server"

const RUNNER_URL = process.env.RUNNER_URL || "http://127.0.0.1:5001"

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  const endpoint = path.join("/")
  const url = `${RUNNER_URL}/${endpoint}`

  const isStream = endpoint === "stream"

  const init: RequestInit = {
    method: req.method,
    headers: { "Content-Type": "application/json" },
  }

  if (req.method === "POST") {
    try {
      const body = await req.text()
      init.body = body
    } catch {
      // no body
    }
  }

  try {
    const upstream = await fetch(url, init)

    if (isStream) {
      // Pass SSE stream through
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
          "Connection": "keep-alive",
        },
      })
    }

    const data = await upstream.json()
    return NextResponse.json(data, { status: upstream.status })
  } catch (e) {
    return NextResponse.json(
      { error: "Runner unavailable", detail: String(e) },
      { status: 503 }
    )
  }
}

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  return proxy(req, params.path)
}
