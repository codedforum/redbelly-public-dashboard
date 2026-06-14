import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the static build work at any path (root, a subpath, or Vercel).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", sourcemap: false },
});
