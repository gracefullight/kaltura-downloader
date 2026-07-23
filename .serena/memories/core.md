# Core
- Bun workspace; product code lives in `apps/ext`, a Chrome extension for downloading Kaltura HLS streams.
- Runtime flow: `background.ts` detects manifests through `chrome.webRequest` and parses quality variants; `content.ts` owns the page UI/message bridge; `downloader.ts` runs in MAIN world to fetch media with page-origin access; `parser.ts` parses HLS playlists; `transmux.ts` converts MPEG-TS to MP4.
- Shared message/domain types live in `apps/ext/src/types.ts`.
- Preserve the three-layer browser boundary (background detection → isolated content bridge → MAIN-world downloader); cross-boundary payloads must stay synchronized with shared types.
- Read `mem:tech_stack` for toolchain pins and `mem:conventions` before source changes.
- Read `mem:task_completion` for required verification and `mem:suggested_commands` for workflows.