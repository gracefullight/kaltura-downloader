# Firefox Hotmart `Play first` review (2026-07-24)

## Scope
Reviewed the Firefox compatibility changes for `apps/ext`, including manifest/background lifecycle, Hotmart HLS detection, session recovery, content-script fallback detection, and master/media playlist download behavior.

## Reproduction and root cause
- Reproduced on a logged-in Firefox session at the target Teachable lecture: video was genuinely playing, but the extension still showed `Play first`.
- `chrome.storage.session` remained empty, so the prior restart-recovery change could not help because manifest data had never been persisted.
- Firefox received Hotmart requests with a valid tab id, but the implementation only persisted after asynchronous background fetch/parsing. Event backgrounds can suspend after an event listener returns. In addition, a narrow `.m3u8` match pattern was fragile for Firefox, and the Hotmart iframe itself had the relevant resource entries.

## Implemented remediation
- Use a broad permitted Hotmart `webRequest` host filter and classify `.m3u8` via `URL.pathname`.
- Persist an immediately usable direct HLS fallback before asynchronous parsing.
- Observe Hotmart iframe Resource Timing entries and report manifest URLs through a validated runtime message.
- Validate both sender origin and reported manifest host/path in the background.
- Resolve a master playlist to its highest-bandwidth media playlist in the page-context downloader.
- Keep Firefox session restoration and cleanup from the earlier change.

## Verification
- Live Firefox verification: after extension reload, page reload, and playback, Download showed `1244kbps` and `HLS` instead of `Play first`. No large video download was started.
- 83 tests passed (5 files).
- Biome lint passed.
- Build passed; dist sizes: background 14.05 KB, content 12.37 KB, downloader 316.83 KB.
- `web-ext lint`: 0 errors, 0 notices, 1 expected warning that Firefox ignores `background.service_worker`; `background.scripts` is present as the Firefox fallback.
- `git diff --check` passed.

## Review findings / severity
- MEDIUM: `bun audit` reports 8 development-toolchain vulnerabilities (4 high, 3 moderate, 1 low) through PostCSS/Vite/esbuild used by tsup/vitest. These are not bundled runtime extension dependencies but should be remediated with a controlled dependency update.
- LOW: The overlay can appear in both the Hotmart iframe and top-level page, producing duplicate Download controls.
- LOW: Status text such as `Play first`/`Ready` is not exposed through an `aria-live` region.
- LOW: MAIN-world `postMessage` commands use a source marker but cannot provide a strong trust boundary against scripts already running in the host page; reported manifest runtime messages are separately origin/host validated.

Overall review decision: MEDIUM because of dev-toolchain audit findings; the Firefox runtime blocker itself is fixed and verified.