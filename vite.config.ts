import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the static build work at any path (root, a subpath, or Vercel).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
    // Stable asset filenames (no content hash) so a cached index.html never
    // points at a deleted file after a redeploy (no blank page). With the host's
    // short js/css cache, updates still propagate within minutes.
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/app.[ext]",
      },
    },
  },
});
