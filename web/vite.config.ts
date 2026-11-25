import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Relative paths so the same build works at a domain root or a sub-path (e.g. GitHub Pages).
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
});
