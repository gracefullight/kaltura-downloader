import { cp } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    background: "src/background.ts",
    content: "src/content.ts",
    downloader: "src/downloader.ts",
  },
  outDir: "dist",
  format: "iife",
  target: "chrome120",
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  outExtension: () => ({ js: ".js" }),
  onSuccess: async () => {
    await cp("src/manifest.json", "dist/manifest.json");
    await cp("src/content.css", "dist/content.css");
    await cp("src/popup.html", "dist/popup.html");
    await cp("src/popup.css", "dist/popup.css");
  },
});
