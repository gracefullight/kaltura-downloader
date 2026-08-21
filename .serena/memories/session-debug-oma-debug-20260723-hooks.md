# OMA Session Mirror: debug oma-debug-20260723-hooks

- workflow: debug
- status: completed
- phase: (none)
- created: 2026-07-23T11:09:20.288Z
- events: 5

## Decisions
- **debug.root-cause** → Treat stale in-memory hook registrations that still invoke deleted legacy hook files as the root cause. _(The legacy Stop and PreToolUse commands from commit ecd4252 reproduce exit code 1 with Module not found, while every new oma-hook wrapper exits 0 and current settings contain no legacy references.)_
- **debug.root-cause** → Treat volatile in-memory manifest state in the Firefox Manifest V3 background event page as the root cause of the false Play first response. _(The HAR proves a valid Hotmart master playlist, media playlist, AES key, and segments loaded successfully; the project parser extracts five variants from that exact HAR master; GET_DOWNLOAD_INFO only reads module-level Map instances, which are recreated empty whenever Firefox unloads and restarts its non-persistent Manifest V3 background page.)_

## Gates
- (none recorded)

## Vendor Boundaries
- (new) → codex (2026-07-23T13:06:56.801Z)

## Recent Events
- 2026-07-23T11:09:20.288Z `session.created`
- 2026-07-23T11:09:21.377Z `decision.made`
- 2026-07-23T13:06:56.801Z `boundary`
- 2026-07-23T13:15:36.484Z `decision.made`
- 2026-07-23T13:22:51.967Z `session.ended`
