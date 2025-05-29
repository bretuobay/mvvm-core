import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    outDir: "dist", // Explicitly set outDir
    lib: {
      entry: "./src/index.ts",
      formats: ["es", "umd"],
      name: "index",
      fileName: "index",
    },
  },
  plugins: [dts({ insertTypesEntry: true, outDir: "dist" })], // also specify for dts plugin
});
