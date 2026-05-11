import type { Metadata } from "next"
import "./globals.css"
import Nav from "@/components/nav"
import SearchModal from "@/components/search-modal"

export const metadata: Metadata = {
  title: { default: "LLM Arena", template: "%s | LLM Arena" },
  description: "Открытый бенчмарк бесплатных LLM — швейцарский турнир, мультикритериальное судейство, эволюция промптов",
  metadataBase: new URL("https://onlyanalyst.ru"),
  openGraph: {
    siteName: "LLM Arena",
    locale: "ru_RU",
    type: "website",
    images: ["/api/og"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/api/og"],
  },
  alternates: {
    types: { "application/rss+xml": "/feed.xml" },
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen">
        {/* Run before first paint: read saved theme and apply/remove .dark class */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('theme');
            if (t === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
          } catch(e) { document.documentElement.classList.add('dark'); }
        `}} />
        <Nav />
        <SearchModal />
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
