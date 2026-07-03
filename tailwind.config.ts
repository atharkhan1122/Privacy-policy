import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050D12",
        hull: "#0A1920",
        panel: "#0D2029",
        foam: "#D9E7E4",
        "foam-soft": "#8FADAE",
        magenta: "#FF2E96",
        "magenta-ink": "#C40D6E",
        brass: "#D9A441",
        instr: "#3EE6A8",
        line: "rgba(217,231,228,0.15)",
        "line-soft": "rgba(217,231,228,0.08)",
        danger: "#FF5C5C",
      },
      fontFamily: {
        sans: ["Saira", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: [
          "IBM Plex Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
