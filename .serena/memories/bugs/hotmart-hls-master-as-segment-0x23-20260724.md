# Hotmart HLS `0x23` / #EXTM3U as MPEG-TS (2026-07-24)

## Symptom
After AES/session-key fix, download failed with:
`Input is not MPEG-TS (expected sync byte 0x47, got 0x23)`

## Root cause
`downloadHLS` called `parseMediaPlaylist` first. Master playlists have non-# URI lines under `#EXT-X-STREAM-INF` (media m3u8 URLs). Those were treated as **segment** URLs. Fetching them returns playlist text starting with `#EXTM3U` → first byte `0x23`.

Secondary gap: quality selection downloads a **media** variant URL only; Hotmart `EXT-X-SESSION-KEY` stays on the master and was not loaded.

## Fix
1. Detect master via `parseMasterPlaylist` **first**; only then parse media with optional session key.
2. Pass `masterUrl` from content → downloader; `fetchSessionKey(masterUrl)` when media omits EXT-X-KEY.
3. Clearer transmux error when buffer starts with `#EXTM3U`.

## Verification
97 tests passed; build OK.
