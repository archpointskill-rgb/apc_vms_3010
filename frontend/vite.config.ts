import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser talks to Vite, which passes /api to the backend.
// In production both are served from the same place, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
  build: { sourcemap: false }
});
