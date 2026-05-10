import type { Config } from "tailwindcss"
import typography from "@tailwindcss/typography"

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        accent: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5",
        },
      },
      typography: {
        DEFAULT: {
          css: {
            "--tw-prose-body":          "#d1d5db",
            "--tw-prose-headings":      "#f9fafb",
            "--tw-prose-lead":          "#9ca3af",
            "--tw-prose-links":         "#a5b4fc",
            "--tw-prose-bold":          "#f9fafb",
            "--tw-prose-counters":      "#9ca3af",
            "--tw-prose-bullets":       "#4b5563",
            "--tw-prose-hr":            "#2a2d3e",
            "--tw-prose-quotes":        "#e5e7eb",
            "--tw-prose-quote-borders": "#6366f1",
            "--tw-prose-captions":      "#9ca3af",
            "--tw-prose-code":          "#fbbf24",
            "--tw-prose-pre-code":      "#e5e7eb",
            "--tw-prose-pre-bg":        "#0a0c12",
            "--tw-prose-th-borders":    "#2a2d3e",
            "--tw-prose-td-borders":    "#2a2d3e",
          },
        },
      },
    },
  },
  plugins: [typography],
}

export default config
