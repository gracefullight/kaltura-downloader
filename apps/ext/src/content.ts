/**
 * Content Script (ISOLATED world).
 *
 * Detects the Kaltura player, injects download UI, and bridges
 * between the background service worker and the page-context downloader.
 */

import { sanitizeFilename } from "./filename.js";
import type { GetDownloadInfoResponse, ManifestReadyMessage, Variant } from "./types.js";

const MSG_TO_PAGE = "kd-content";
const MSG_FROM_PAGE = "kd-downloader";

// --- Extract identifiers from the page URL ---

const entryIdMatch = location.pathname.match(/entryid\/([^/]+)/i);
if (entryIdMatch) {
  const entryId = entryIdMatch[1];
  let variants: Pick<Variant, "url" | "label" | "resolution" | "bandwidth">[] | null =
    null;
  let masterUrl: string | null = null;

  // --- Listen for messages from page-context downloader ---

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.data?.source !== MSG_FROM_PAGE) return;

    switch (e.data.type) {
      case "PROGRESS":
        updateProgress(e.data);
        break;
      case "COMPLETE":
        onComplete(e.data);
        break;
      case "ABORTED":
        showMsg("Download aborted.", "warn");
        resetUI();
        break;
      case "ERROR":
        showMsg(`Error: ${e.data.error}`, "warn");
        resetUI();
        break;
    }
  });

  // --- Listen for messages from the background ---

  chrome.runtime.onMessage.addListener((msg: ManifestReadyMessage) => {
    if (msg.type === "MANIFEST_READY" && msg.entryId === entryId) {
      const el = document.getElementById("kd-msg");
      if (el && !el.textContent?.includes("Download")) {
        showMsg("Ready to download.", "ok");
        setTimeout(() => {
          const m = document.getElementById("kd-msg");
          if (m?.textContent === "Ready to download.") m.textContent = "";
        }, 3000);
      }
    }
  });

  // --- Wait for the player element ---

  function init(): void {
    const player = findPlayer();
    if (player) {
      setup(player);
    } else {
      const observer = new MutationObserver(() => {
        const p = findPlayer();
        if (p) {
          observer.disconnect();
          setup(p);
        }
      });
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
      setTimeout(() => observer.disconnect(), 30000);
    }
  }

  function findPlayer(): Element | null {
    return (
      document.getElementById("kplayer") ||
      document.getElementById("kaltura_player") ||
      document.querySelector("[id*='kaltura_player']") ||
      document.querySelector(".mwEmbedKalturaIframe")
    );
  }

  // --- Inject download UI ---

  function setup(playerEl: Element): void {
    if (document.getElementById("kd-container")) return;

    const container = document.createElement("div");
    container.id = "kd-container";
    container.innerHTML = `
      <div class="kd-bar">
        <button id="kd-btn" class="kd-btn kd-btn-primary" title="Download this video">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Download</span>
        </button>
        <button id="kd-copy-btn" class="kd-btn kd-btn-secondary"
                title="Copy m3u8 URL for ffmpeg" style="display:none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>Copy m3u8</span>
        </button>
        <span id="kd-msg" class="kd-msg"></span>
      </div>
      <div id="kd-quality-menu" class="kd-quality-menu"></div>
      <div id="kd-progress" class="kd-progress" style="display:none;">
        <div class="kd-progress-bar">
          <div id="kd-progress-fill" class="kd-progress-fill"></div>
        </div>
        <span id="kd-progress-text" class="kd-progress-text"></span>
      </div>
    `;

    playerEl.parentNode?.insertBefore(container, playerEl.nextSibling);
    document.getElementById("kd-btn")?.addEventListener("click", onDownloadClick);
    document.getElementById("kd-copy-btn")?.addEventListener("click", onCopyClick);
  }

  // --- Download button ---

  function onDownloadClick(): void {
    const btn = document.getElementById("kd-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.classList.add("kd-loading");
    showMsg("", "");

    chrome.runtime.sendMessage(
      { type: "GET_DOWNLOAD_INFO", entryId },
      (resp: GetDownloadInfoResponse) => {
        if (chrome.runtime.lastError || !resp?.ok || !resp.variants?.length) {
          showMsg("Play the video first, then try again.", "warn");
          resetUI();
          return;
        }

        variants = resp.variants;
        masterUrl = resp.masterUrl ?? null;

        if (masterUrl) {
          const copyBtn = document.getElementById("kd-copy-btn");
          if (copyBtn) copyBtn.style.display = "inline-flex";
        }

        if (variants && variants.length === 1) {
          startDownload(variants[0]);
        } else if (variants) {
          showQualityMenu(variants);
          btn.disabled = false;
          btn.classList.remove("kd-loading");
        }
      },
    );
  }

  // --- Quality selection ---

  function showQualityMenu(
    list: Pick<Variant, "url" | "label" | "resolution" | "bandwidth">[],
  ): void {
    const menu = document.getElementById("kd-quality-menu");
    if (!menu) return;
    menu.style.display = "flex";
    menu.innerHTML = "";

    for (const v of list) {
      const item = document.createElement("button");
      item.className = "kd-quality-item";
      item.innerHTML = `
        <span class="kd-quality-label">${v.label}</span>
        ${v.resolution !== "unknown" ? `<span class="kd-quality-res">${v.resolution}</span>` : ""}
      `;
      item.addEventListener("click", () => {
        menu.style.display = "none";
        startDownload(v);
      });
      menu.appendChild(item);
    }
  }

  // --- Start HLS download via page-context downloader ---

  function startDownload(variant: Pick<Variant, "url" | "label">): void {
    const btn = document.getElementById("kd-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.classList.add("kd-loading");

    const qualityMenu = document.getElementById("kd-quality-menu");
    if (qualityMenu) qualityMenu.style.display = "none";
    const progress = document.getElementById("kd-progress");
    if (progress) progress.style.display = "block";

    const title = getVideoTitle();
    const filename = `${title}_${variant.label}.ts`;

    window.postMessage(
      {
        source: MSG_TO_PAGE,
        type: "START_DOWNLOAD",
        variantUrl: variant.url,
        filename,
      },
      "*",
    );
  }

  // --- Progress ---

  function updateProgress(data: { phase: string; text: string; percent?: number }): void {
    const fill = document.getElementById("kd-progress-fill");
    const text = document.getElementById("kd-progress-text");
    if (!fill || !text) return;

    const progressEl = document.getElementById("kd-progress");
    if (progressEl) progressEl.style.display = "block";
    text.textContent = data.text;

    if (data.phase === "downloading") {
      fill.style.width = `${data.percent ?? 0}%`;
    } else if (data.phase === "merging" || data.phase === "saving") {
      fill.style.width = "100%";
    }
  }

  function onComplete(data: { sizeMB: string }): void {
    showMsg(
      `Download complete! (${data.sizeMB} MB) — Convert: ffmpeg -i file.ts -c copy file.mp4`,
      "ok",
    );
    const text = document.getElementById("kd-progress-text");
    if (text) text.textContent = `Done — ${data.sizeMB} MB`;
    resetUI();
  }

  // --- Copy m3u8 URL ---

  function onCopyClick(): void {
    if (!masterUrl) {
      showMsg("No m3u8 URL available. Play the video first.", "warn");
      return;
    }

    navigator.clipboard.writeText(masterUrl).then(
      () => showMsg("m3u8 URL copied! Use: ffmpeg -i '<url>' -c copy output.mp4", "ok"),
      () => {
        const input = document.createElement("input");
        input.value = masterUrl ?? "";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
        showMsg("m3u8 URL copied!", "ok");
      },
    );
  }

  // --- UI helpers ---

  function showMsg(text: string, type: string): void {
    const el = document.getElementById("kd-msg");
    if (!el) return;
    el.textContent = text;
    el.className = `kd-msg${type ? ` kd-msg-${type}` : ""}`;
  }

  function resetUI(): void {
    const btn = document.getElementById("kd-btn") as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("kd-loading");
    }
  }

  function getVideoTitle(): string {
    const raw =
      document.querySelector(".entryTitle")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title?.trim() ||
      entryId;

    return sanitizeFilename(raw);
  }

  // --- Init ---

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
