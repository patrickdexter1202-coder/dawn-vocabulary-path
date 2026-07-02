import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH
    || (process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_REPOSITORY
      ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
      : "/"),
  // 生产构建由迁移包单独携带静态资源；跳过 Vite 对 public 目录的重复复制。
  publicDir: command === "build" ? false : "public",
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
}));
