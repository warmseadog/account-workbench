import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: false
  },
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    globals: true
  }
});
