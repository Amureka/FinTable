import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" — сайт работает и на корне домена, и в подпапке GitHub Pages
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500
  }
});
