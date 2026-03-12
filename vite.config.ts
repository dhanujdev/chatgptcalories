import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "web/dist"),
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, "web/src/main.tsx"),
      formats: ["es"],
      fileName: () => "calorie-widget.js",
      name: "CalorieWidget",
    },
  },
});

