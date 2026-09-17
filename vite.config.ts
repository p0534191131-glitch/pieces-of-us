import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// בפיתוח: Vite מגיש את הממשק, והשרת המקומי (server/index.mjs, פורט 5200) מטפל בחדרים ובתמונות.
const GAME_SERVER = "http://localhost:5200";

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": GAME_SERVER,
      "/photos": GAME_SERVER,
      "/ws": { target: GAME_SERVER.replace("http", "ws"), ws: true },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
