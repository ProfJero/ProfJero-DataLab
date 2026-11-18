import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1200px" } },
    extend: {
      fontFamily: { sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"] },
      colors: {
        navy: { DEFAULT: "#112442", 50: "#EEF2F8", 100: "#D7E0EE", 600: "#1B355E", 700: "#152B4D", 800: "#112442", 900: "#0B1830" },
        brand: { DEFAULT: "#2864C5", 50: "#EEF4FD", 100: "#D9E6FA", 200: "#B3CDF5", 300: "#7FA9EC", 400: "#4C84DE", 500: "#2864C5", 600: "#1F51A6", 700: "#1A4386", 800: "#17396E", 900: "#132F5A" },
        insight: { DEFAULT: "#20A47A", 50: "#E9F8F2", 100: "#C9EEDF", 500: "#20A47A", 600: "#178563", 700: "#126A4F" },
        canvas: "#F5F7FB",
        ink: { DEFAULT: "#0F172A", muted: "#64748B", subtle: "#94A3B8" },
        line: "#E2E8F0",
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      boxShadow: {
        card: "0 1px 2px rgba(17,36,66,0.04), 0 1px 3px rgba(17,36,66,0.06)",
        pop: "0 10px 30px -10px rgba(17,36,66,0.25), 0 4px 10px -4px rgba(17,36,66,0.12)",
        focus: "0 0 0 3px rgba(40,100,197,0.25)",
      },
      keyframes: { "fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "none" } } },
      animation: { "fade-in": "fade-in .18s ease-out" },
    },
  },
  plugins: [],
} satisfies Config;
