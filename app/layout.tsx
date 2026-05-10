import type { Metadata } from "next"
import "./globals.css"
import Nav from "@/components/nav"

export const metadata: Metadata = {
  title: { default: "LLM Arena", template: "%s | LLM Arena" },
  description: "Открытый бенчмарк бесплатных LLM — швейцарский турнир, мультикритериальное судейство, эволюция промптов",
  metadataBase: new URL("https://onlyanalyst.ru"),
  openGraph: {
    siteName: "LLM Arena",
    locale: "ru_RU",
    type: "website",
  },
  robots: { index: true, follow: true },
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
