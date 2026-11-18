import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    // In development, proxy /api to a local `wrangler dev` (apps/api) or the deployed API.
    proxy: { "/api": { target: process.env.VITE_DEV_API_TARGET ?? "http://127.0.0.1:8787", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          data: ["@tanstack/react-query", "@supabase/supabase-js"],
          charts: ["recharts"],
        },
      },
    },
  },
  test: { environment: "jsdom", globals: false },
});
