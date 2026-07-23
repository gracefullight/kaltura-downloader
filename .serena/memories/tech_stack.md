# Tech Stack
- TypeScript, strict mode, ES2022/DOM libs, ESM source.
- Bun workspaces/package manager; root scripts fan out to `apps/*`.
- Chrome Extension targeting Chrome 120; `@types/chrome`.
- tsup builds three IIFE entries: background, content, downloader; copies manifest/CSS/HTML assets into `apps/ext/dist`.
- Vitest 4 for tests; Biome 2 for lint/format.
- `mux.js` handles MPEG-TS → MP4 transmuxing.
- No source maps, no code splitting, and non-minified extension output by current build configuration.