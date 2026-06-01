import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#f7f6f3",
          deep: "#ece9e2",
          elevated: "#ffffff",
          panel: "#fbfaf8",
        },
        glass: {
          DEFAULT: "#ffffff",
          strong: "#ffffff",
          subtle: "#f3f1ed",
        },
        border: {
          DEFAULT: "#dedbd2",
          strong: "#c8c3b8",
          subtle: "#ebe7df",
        },
        text: {
          DEFAULT: "#37352f",
          muted: "#6f6a60",
          subtle: "#9b9488",
        },
        accent: {
          DEFAULT: "#2f6f68",
          hover: "#255b55",
          glow: "#e8f1ef",
        },
        danger: "#b94a48",
        success: "#2f7d5b",
        warning: "#b7791f",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
        mono: ["SF Mono", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      backdropBlur: {
        xs: "4px",
      },
      boxShadow: {
        glass:
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 28px -24px rgba(15, 23, 42, 0.35)",
        "glass-lg":
          "0 1px 2px rgba(15, 23, 42, 0.05), 0 24px 48px -32px rgba(15, 23, 42, 0.3)",
        glow: "0 0 0 3px rgba(47,111,104,0.12)",
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "slide-up": "slide-up 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)",
        shimmer: "shimmer 2.5s linear infinite",
      },
      keyframes: {
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
