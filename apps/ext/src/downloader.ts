/**
 * Page-context HLS segment downloader (MAIN world).
 *
 * Runs in the page's origin so fetch() inherits the same CORS
 * permissions as the Kaltura video player.
 */

import { parseVariantPlaylist } from "./parser.js";
import { transmuxTsToMp4 } from "./transmux.js";
import type { CompleteMessage, ErrorMessage, ProgressMessage } from "./types.js";

const MAX_CONCURRENT = 6;
const MAX_RETRIES = 3;
const MSG_SOURCE = "kd-downloader";
const MSG_TARGET = "kd-content";

let aborted = false;

// --- Listen for commands from content script ---

window.addEventListener("message", (e: MessageEvent) => {
  if (e.data?.source !== MSG_TARGET) return;

  if (e.data.type === "START_DOWNLOAD") {
    aborted = false;
    downloadHLS(e.data.variantUrl as string, e.data.filename as string).catch(
      (err: Error) => {
        post<ErrorMessage>("ERROR", { error: err.message || String(err) });
      },
    );
  } else if (e.data.type === "DOWNLOAD_SUBTITLE") {
    downloadSubtitle(e.data.url as string, e.data.filename as string).catch(
      (err: Error) => {
        post<ErrorMessage>("ERROR", { error: err.message || String(err) });
      },
    );
  } else if (e.data.type === "ABORT") {
    aborted = true;
  }
});

// --- Main download flow ---

async function downloadHLS(variantUrl: string, filename: string): Promise<void> {
  // 1. Fetch variant playlist
  post<ProgressMessage>("PROGRESS", {
    phase: "playlist",
    text: "Fetching playlist…",
  });

  const resp = await fetch(variantUrl);
  if (!resp.ok) throw new Error(`Playlist fetch failed: HTTP ${resp.status}`);

  const m3u8Text = await resp.text();
  const segments = parseVariantPlaylist(m3u8Text, variantUrl);

  if (segments.length === 0) {
    throw new Error("No segments found in playlist");
  }

  post<ProgressMessage>("PROGRESS", {
    phase: "downloading",
    total: segments.length,
    completed: 0,
    percent: 0,
    text: `Downloading: 0/${segments.length} segments (0%)`,
  });

  // 2. Download all segments concurrently
  const buffers = new Array<ArrayBuffer>(segments.length);
  let completed = 0;

  const queue = segments.map((url, idx) => ({ url, idx }));
  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () =>
    processQueue(queue, buffers, () => {
      completed++;
      const pct = Math.round((completed / segments.length) * 100);
      post<ProgressMessage>("PROGRESS", {
        phase: "downloading",
        total: segments.length,
        completed,
        percent: pct,
        text: `Downloading: ${completed}/${segments.length} segments (${pct}%)`,
      });
    }),
  );

  await Promise.all(workers);

  if (aborted) {
    post("ABORTED", {});
    return;
  }

  // 3. Merge TS segments
  post<ProgressMessage>("PROGRESS", {
    phase: "merging",
    text: "Merging segments…",
  });

  const totalSize = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  // 4. Transmux TS → MP4
  post<ProgressMessage>("PROGRESS", {
    phase: "merging",
    text: "Converting to MP4…",
  });

  const mp4Data = await transmuxTsToMp4(merged);

  // 5. Save as MP4
  post<ProgressMessage>("PROGRESS", {
    phase: "saving",
    text: "Saving file…",
  });

  const mp4Filename = (filename || "video.ts").replace(/\.ts$/, ".mp4");
  const blob = new Blob([mp4Data], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = mp4Filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 120_000);

  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
  post<CompleteMessage>("COMPLETE", { size: blob.size, sizeMB });
}

// --- Concurrent queue worker ---

interface QueueItem {
  url: string;
  idx: number;
}

async function processQueue(
  queue: QueueItem[],
  buffers: ArrayBuffer[],
  onComplete: () => void,
): Promise<void> {
  while (queue.length > 0) {
    if (aborted) return;

    const item = queue.shift();
    if (!item) break;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (aborted) return;
      try {
        const resp = await fetch(item.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        buffers[item.idx] = await resp.arrayBuffer();
        onComplete();
        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    if (lastError) {
      throw new Error(
        `Segment ${item.idx + 1} failed after ${MAX_RETRIES} retries: ${lastError.message}`,
      );
    }
  }
}

// --- Helpers ---

// --- Subtitle download ---

async function downloadSubtitle(
  url: string,
  filename: string,
): Promise<void> {
  post<ProgressMessage>("PROGRESS", {
    phase: "downloading",
    text: "Downloading subtitle…",
  });

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Subtitle fetch failed: HTTP ${resp.status}`);

  const text = await resp.text();
  const blob = new Blob([text], { type: "text/vtt" });
  const blobUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename || "subtitle.vtt";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

  const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
  post<CompleteMessage>("COMPLETE", { size: blob.size, sizeMB });
}

// --- Helpers ---

function post<T extends Record<string, unknown>>(
  type: string,
  data: Omit<T, "source" | "type">,
): void {
  window.postMessage({ source: MSG_SOURCE, type, ...data }, "*");
}

// Signal ready
post("READY", {});
