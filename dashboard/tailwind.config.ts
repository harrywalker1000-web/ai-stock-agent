import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#030005",
          deep: "#010002",
          surface: "rgba(255,255,255,0.04)",
          elevated: "rgba(255,255,255,0.07)",
        },
        accent: {
          DEFAULT: "#F5A623",
          dim: "#D97706",
          glow: "rgba(245,166,35,0.2)",
          cyan: "#00D4FF",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.08)",
          accent: "rgba(245,166,35,0.3)",
          strong: "rgba(255,255,255,0.15)",
        },
        text: {
          primary: "#E8EDF2",
          secondary: "#6B7280",
          muted: "#4B5563",
          accent: "#F5A623",
        },
        profit: "#10B981",
        loss: "#EF4444",
        warning: "#F59E0B",
      },
      fontFamily: {
        sans: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "monospace"],
      },
      boxShadow: {
        glass: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glass-lg": "0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        accent: "0 0 20px rgba(245,166,35,0.25)",
        "accent-lg": "0 0 40px rgba(245,166,35,0.3)",
        profit: "0 0 20px rgba(16,185,129,0.2)",
        loss: "0 0 20px rgba(239,68,68,0.2)",
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "float": "float 6s ease-in-out infinite",
        "glow-pulse": "glow 3s ease-in-out infinite alternate",
        "orb": "orb 12s ease-in-out infinite",
        "spin-slow": "spin 20s linear infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(245,166,35,0.2)" },
          "100%": { boxShadow: "0 0 40px rgba(245,166,35,0.5)" },
        },
        orb: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(30px, -20px) scale(1.05)" },
          "66%": { transform: "translate(-20px, 10px) scale(0.95)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
