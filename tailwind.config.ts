import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

/**
 * Grab theme.
 *
 * Every colour is a CSS variable defined in src/index.css so the light/dark
 * swap is a single class toggle on <html>. Only ONE accent colour exists.
 * Spacing follows an 8px grid (Tailwind's default 4px scale is used only in
 * multiples of 2). Radii are 12px by default.
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "hsl(var(--surface) / <alpha-value>)",
        elevated: "hsl(var(--elevated) / <alpha-value>)",
        sunken: "hsl(var(--sunken) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        "border-strong": "hsl(var(--border-strong) / <alpha-value>)",
        fg: "hsl(var(--fg) / <alpha-value>)",
        "fg-muted": "hsl(var(--fg-muted) / <alpha-value>)",
        "fg-faint": "hsl(var(--fg-faint) / <alpha-value>)",
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          fg: "hsl(var(--accent-fg) / <alpha-value>)",
          soft: "hsl(var(--accent-soft) / <alpha-value>)",
        },
        danger: "hsl(var(--danger) / <alpha-value>)",
        success: "hsl(var(--success) / <alpha-value>)",
        // shadcn compatibility aliases
        background: "hsl(var(--surface) / <alpha-value>)",
        foreground: "hsl(var(--fg) / <alpha-value>)",
        input: "hsl(var(--border) / <alpha-value>)",
        ring: "hsl(var(--accent) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-fg) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--sunken) / <alpha-value>)",
          foreground: "hsl(var(--fg-muted) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--elevated) / <alpha-value>)",
          foreground: "hsl(var(--fg) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--danger) / <alpha-value>)",
          foreground: "hsl(0 0% 100% / <alpha-value>)",
        },
      },
      borderRadius: {
        DEFAULT: "12px",
        lg: "12px",
        md: "8px",
        sm: "6px",
        xl: "16px",
      },
      fontFamily: {
        sans: [
          "Inter Variable",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "16px" }],
      },
      boxShadow: {
        // Deliberately minimal: 1px borders do the work, shadows only lift
        // floating layers a hair off the surface.
        float: "0 1px 2px hsl(0 0% 0% / 0.2), 0 8px 24px -8px hsl(0 0% 0% / 0.35)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
