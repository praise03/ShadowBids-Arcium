import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f0d",
        graphite: "#141917",
        panel: "#1b211e",
        brass: "#c9a45c",
        mint: "#8fd6b4",
        signal: "#f26d5b",
        fog: "#cfd8d2",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(201,164,92,.18), 0 24px 80px rgba(0,0,0,.38)",
      },
    },
  },
  plugins: [],
};

export default config;
