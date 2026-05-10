import type { Metadata } from "next"
import "./globals.css"
import Nav from "@/components/nav"

export const metadata: Metadata = {
  title: "LLM Tournament Benchmark",
  description: "Open benchmark for free LLMs — Swiss tournament, multi-criteria judging, prompt evolution",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-[#0f1117] text-gray-100">
        <Nav />
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
