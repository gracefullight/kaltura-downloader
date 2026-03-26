# Kaltura Downloader

[English](./README.md) | [한국어](./README.ko.md)

Chrome extension that downloads HLS videos from Kaltura (KAF) players.

Adds a download button below the video player. Click it to download all segments in parallel and merge them into a single file.

## Features

- Auto-detects Kaltura playManifest (m3u8)
- Quality selection (1080p, 720p, etc.)
- 6 concurrent HLS segment downloads with auto-retry
- Real-time progress bar
- Copy m3u8 URL for manual ffmpeg download

## Install

### GitHub Releases

1. Download the latest zip from [Releases](https://github.com/gracefullight/kaltura-downloader/releases)
2. Unzip
3. Chrome → `chrome://extensions` → Enable Developer mode
4. Click "Load unpacked" → Select the unzipped folder

### Build from source

```bash
bun install
bun run build
```

Load `apps/ext/dist/` in Chrome.

## Usage

1. Navigate to a KAF Kaltura page
2. Play the video
3. Click the **Download** button below the player
4. Select quality → Download starts

Output format is `.ts` (MPEG-TS). To convert to MP4:

```bash
ffmpeg -i video.ts -c copy video.mp4
```

## Structure

```
apps/ext/           Chrome extension
├── src/
│   ├── background.ts   Intercepts playManifest m3u8 and parses quality variants
│   ├── content.ts      Download UI and message bridge (ISOLATED world)
│   ├── downloader.ts   HLS segment downloader (MAIN world)
│   ├── parser.ts       m3u8 master/media playlist parser
│   ├── filename.ts     Filename sanitizer
│   └── types.ts        Shared type definitions
├── tsup.config.ts
└── tsconfig.json
```

## Development

```bash
bun install
bun run dev         # watch mode
bun run test        # vitest
bun run lint        # biome
```

## How it works

1. **background** — Intercepts `playManifest` m3u8 requests via `webRequest`, parses the master playlist to extract variant URLs per quality level
2. **content** (ISOLATED world) — Injects a download button below the player, relays messages between background and downloader
3. **downloader** (MAIN world) — Runs in the page's origin to fetch CloudFront-signed segments, then merges and saves as a Blob URL

The MAIN world is used so that `fetch()` inherits the same CORS permissions as the video player.

## License

MIT
