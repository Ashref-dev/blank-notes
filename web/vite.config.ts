import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Go API (api/app.go) runs on :8080 during local development (`go run .` from the repo root).
const api = process.env.API_ORIGIN ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  server: {
    proxy: {
      "/api": api,
      "/health": api,
    },
  },
});
