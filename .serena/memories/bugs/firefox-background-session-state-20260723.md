# Bug: Firefox download falsely reports "Play first"

**Date**: 2026-07-23
**Severity**: MEDIUM
**Status**: FIXED

## Problem
On `www.jimmyssempte.com`, the Firefox extension button appeared after Hotmart playback, but clicking it showed `Play first` instead of download qualities.

## Evidence
The supplied HAR contained a successful Hotmart master playlist, media playlist, AES-128 key, and TS segment responses. The project parser extracted five variants (1080p, 720p, 540p, 360p, 240p) from that exact master playlist.

## Root Cause
`apps/ext/src/background.ts` held manifest and caption state only in module-level `Map` objects. Firefox Manifest V3 runs `background.scripts` as a non-persistent event page, so unloading/restarting the background page recreated the Maps empty. `GET_DOWNLOAD_INFO` then returned `ok: false`, which the content UI rendered as `Play first` even though playback had occurred.

## Fix
- Added the `storage` extension permission.
- Persisted parsed manifest data and captions in `chrome.storage.session`.
- Restored per-tab state when `GET_DOWNLOAD_INFO` finds no in-memory manifest.
- Removed stored state when the tab closes.
- Kept the in-memory Maps as the fast path and preserved exact entry-ID preference.

## Files Modified
- `apps/ext/src/background.ts`
- `apps/ext/src/background.test.ts`
- `apps/ext/src/manifest.json`

## Regression Test
`background restart recovery > restores Hotmart manifest data from session storage` reloads the background module to clear module-level Maps, then verifies `GET_DOWNLOAD_INFO` restores the Hotmart variants from session storage.

## Verification
- 5 test files passed; 80 tests passed.
- Biome lint passed.
- Extension build passed.
- `web-ext lint`: 0 errors, 1 expected warning (`service_worker` ignored by Firefox because `background.scripts` is the Firefox fallback).

## Similar Pattern Scan
The only other background-lifecycle state was `captionStore`; it is now persisted and restored through the same session-storage path. Parser and downloader Maps are function-local and do not require persistence.

## Prevention
Do not rely solely on module-level mutable state in Manifest V3 background contexts. Store session-scoped state in `storage.session` and add a module-reload regression test.