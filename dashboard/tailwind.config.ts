import type { Config } from "tailwindcss";

// Every value here points at a CSS variable defined once in app/globals.css.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: v("canvas"),
        surface: v("surface"),
        raised: v("raised"),
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        ink: { 1: v("ink-1"), 2: v("ink-2"), 3: v("ink-3") },
        accent: { DEFAULT: v("accent"), ink: v("accent-ink") },
        gain: v("gain"),
        loss: v("loss"),
        caution: v("caution"),
        cat: {
          1: v("cat-1"), 2: v("cat-2"), 3: v("cat-3"), 4: v("cat-4"),
          5: v("cat-5"), 6: v("cat-6"), 7: v("cat-7"), 8: v("cat-8"),
        },
        // legacy aliases still referenced in a few class names
        profit: v("gain"),
        warning: v("caution"),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-serif)", "Georgia", "serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // [size, line-height] — the type scale (DESIGN_DIRECTION.md §3)
        micro: ["12px", "16px"],
        label: ["13px", "18px"],
        body: ["14px", "22px"],
        lead: ["16px", "26px"],
        h3: ["18px", "24px"],
        h2: ["24px", "30px"],
        h1: ["32px", "38px"],
        figure: ["44px", "48px"],
        display: ["64px", "64px"],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-lg)",   // legacy xl/2xl collapse onto the panel radius
        "2xl": "var(--r-lg)",
      },
      // Every integer step, so modifiers like `/8` or `/12` (legacy markup) generate classes
      opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)])),
      boxShadow: {
        pop: "var(--shadow-pop)",
      },
      transitionTimingFunction: { brand: "cubic-bezier(0.23, 1, 0.32, 1)" },
      transitionDuration: { fast: "120ms", base: "200ms", slow: "320ms" },
    },
  },
  plugins: [],
};

export default config;
