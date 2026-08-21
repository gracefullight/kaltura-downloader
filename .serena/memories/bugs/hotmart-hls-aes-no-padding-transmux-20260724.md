# Hotmart HLS AES-128 no-padding → Transmuxing produced no output (2026-07-24)

## Symptom
HLS download button fails with `Transmuxing produced no output` on Hotmart streams.

## Root cause (verified)
1. Master playlists advertise `#EXT-X-SESSION-KEY` but media playlists may omit `#EXT-X-KEY`. Downloader only parsed media keys → segments treated as cleartext ciphertext.
2. Even with a key, Hotmart AES-128 CBC segments often have **no PKCS#7 padding**. `crypto.subtle.decrypt` requires padding and fails (or never runs if key missing).
3. Ciphertext / non-TS bytes were pushed to mux.js, which emits no init/media → generic `Transmuxing produced no output`.

HAR fragment decrypt (padding-less CBC) yields MPEG-TS sync `0x47` and successful MP4 transmux.

## Fix (minimal)
- `parseSessionKey` + pass into `parseMediaPlaylist(..., defaultKey)` when resolving master → media
- `decryptAesCbcNoPadding` fallback (empty-buffer encrypt padding-block trick)
- `isMpegTs` gate before mux.js with clearer error
- Regression tests: session-key inherit/override, no-pad decrypt, TS validation

## Files
- `apps/ext/src/parser.ts`
- `apps/ext/src/downloader.ts`
- `apps/ext/src/transmux.ts`
- matching `*.test.ts`

## Verification
94 tests passed (5 files). Build succeeded.
