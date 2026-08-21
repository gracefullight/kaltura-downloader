import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

async function copyStaticAssets(): Promise<void> {
  await cp("src/content.css", "dist/content.css");
  await cp("src/popup.html", "dist/popup.html");
  await cp("src/popup.css", "dist/popup.css");
  await mkdir("dist/icons", { recursive: true });
  await cp("assets/icon-48.png", "dist/icons/icon-48.png");
  await cp("assets/icon-96.png", "dist/icons/icon-96.png");
  await cp("assets/icon-128.png", "dist/icons/icon-128.png");

  const [manifestSource, packageSource] = await Promise.all([
    readFile("src/manifest.json", "utf8"),
    readFile("package.json", "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource) as Record<string, unknown>;
  const packageJson = JSON.parse(packageSource) as { version: string };

  // AMO rejects updates whose manifest version is unchanged. Release Please
  // updates package.json, so derive the published manifest version from it.
  manifest.version = packageJson.version;
  await writeFile("dist/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

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
    await copyStaticAssets();
  },
});
