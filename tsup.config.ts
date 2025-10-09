import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  sourcemap: true,
  dts: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  splitting: false,
  treeshake: true,
  minify: false,
});
