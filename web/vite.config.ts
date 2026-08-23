import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "http://127.0.0.1:9090", ws: true },
      "/api": "http://127.0.0.1:9090",
    },
  },
});
