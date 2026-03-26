/**
 * Content Script (ISOLATED world).
 *
 * Detects the Kaltura player, overlays a download button on the player,
 * and bridges between the background and the page-context downloader.
 */

import { sanitizeFilename } from "./filename.js";
import type {
  CaptionInfo,
  CaptionReadyMessage,
  GetDownloadInfoResponse,
  ManifestReadyMessage,
  Variant,
} from "./types.js";

const MSG_TO_PAGE = "kd-content";
const MSG_FROM_PAGE = "kd-downloader";

const entryIdMatch = location.pathname.match(/entryid\/([^/]+)/i);
if (entryIdMatch) {
  const entryId = entryIdMatch[1];
  let variants: Pick<
    Variant,
    "url" | "label" | "resolution" | "bandwidth"
  >[] | null = null;
  let captions: CaptionInfo[] = [];
  let masterUrl: string | null = null;

  // --- Messages from page-context downloader ---

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
        showMsg("Aborted.", "warn");
        resetUI();
        break;
      case "ERROR":
        showMsg(`Error: ${e.data.error}`, "warn");
        resetUI();
        break;
    }
  });

  // --- Messages from background ---

  chrome.runtime.onMessage.addListener(
    (msg: ManifestReadyMessage | CaptionReadyMessage) => {
      if (msg.type === "MANIFEST_READY" && "entryId" in msg && msg.entryId === entryId) {
        const el = document.getElementById("kd-msg");
        if (el && !el.textContent?.includes("Download")) {
          showMsg("Ready", "ok");
          setTimeout(() => {
            const m = document.getElementById("kd-msg");
            if (m?.textContent === "Ready") m.textContent = "";
          }, 3000);
        }
      }
      if (msg.type === "CAPTION_READY") {
        const subBtn = document.getElementById("kd-sub-btn");
        if (subBtn) subBtn.style.display = "inline-flex";
      }
    },
  );

  // --- Wait for the player ---

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

  function findPlayer(): HTMLElement | null {
    return (
      document.getElementById("kplayer") ||
      document.getElementById("kaltura_player") ||
      (document.querySelector("[id*='kaltura_player']") as HTMLElement) ||
      (document.querySelector(".mwEmbedKalturaIframe") as HTMLElement)
    );
  }

  // --- Overlay UI on the player ---

  function setup(playerEl: HTMLElement): void {
    if (document.getElementById("kd-overlay")) return;

    // Ensure player is a positioning context
    const style = getComputedStyle(playerEl);
    if (style.position === "static") {
      playerEl.style.position = "relative";
    }

    const overlay = document.createElement("div");
    overlay.id = "kd-overlay";
    overlay.innerHTML = `
      <div id="kd-panel" class="kd-panel kd-panel-collapsed">
        <button id="kd-btn" class="kd-pill kd-pill-primary" title="Download video">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span>Download</span>
        </button>
        <button id="kd-sub-btn" class="kd-pill kd-pill-secondary" title="Download subtitle"
                style="display:none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2"/>
            <line x1="1" y1="14" x2="23" y2="14"/>
          </svg>
          <span>Subtitle</span>
        </button>
        <button id="kd-copy-btn" class="kd-pill kd-pill-secondary" title="Copy m3u8 URL"
                style="display:none;">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span>m3u8</span>
        </button>
        <div id="kd-quality-menu" class="kd-quality-menu"></div>
        <div id="kd-msg" class="kd-msg"></div>
        <div id="kd-progress" class="kd-progress" style="display:none;">
          <div class="kd-progress-bar">
            <div id="kd-progress-fill" class="kd-progress-fill"></div>
          </div>
          <span id="kd-progress-text" class="kd-progress-text"></span>
        </div>
      </div>
    `;

    playerEl.appendChild(overlay);

    document
      .getElementById("kd-btn")
      ?.addEventListener("click", onDownloadClick);
    document
      .getElementById("kd-sub-btn")
      ?.addEventListener("click", onSubtitleClick);
    document
      .getElementById("kd-copy-btn")
      ?.addEventListener("click", onCopyClick);
  }

  // --- Download video ---

  function onDownloadClick(): void {
    const btn = document.getElementById("kd-btn") as HTMLButtonElement;
    btn.disabled = true;
    btn.classList.add("kd-loading");
    showMsg("", "");

    chrome.runtime.sendMessage(
      { type: "GET_DOWNLOAD_INFO", entryId },
      (resp: GetDownloadInfoResponse) => {
        if (chrome.runtime.lastError || !resp?.ok || !resp.variants?.length) {
          showMsg("Play first", "warn");
          resetUI();
          return;
        }

        variants = resp.variants;
        masterUrl = resp.masterUrl ?? null;
        captions = resp.captions ?? [];

        if (masterUrl) {
          const copyBtn = document.getElementById("kd-copy-btn");
          if (copyBtn) copyBtn.style.display = "inline-flex";
        }

        if (captions.length > 0) {
          const subBtn = document.getElementById("kd-sub-btn");
          if (subBtn) subBtn.style.display = "inline-flex";
        }

        // Expand panel
        const panel = document.getElementById("kd-panel");
        if (panel) panel.classList.remove("kd-panel-collapsed");

        if (variants && variants.length === 1) {
          startVideoDownload(variants[0]);
        } else if (variants) {
          showQualityMenu(variants);
          btn.disabled = false;
          btn.classList.remove("kd-loading");
        }
      },
    );
  }

  // --- Quality menu ---

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
      item.textContent = v.label;
      item.title = v.resolution !== "unknown" ? v.resolution : v.label;
      item.addEventListener("click", () => {
        menu.style.display = "none";
        startVideoDownload(v);
      });
      menu.appendChild(item);
    }
  }

  // --- Start video download ---

  function startVideoDownload(variant: Pick<Variant, "url" | "label">): void {
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

  // --- Download subtitle ---

  function onSubtitleClick(): void {
    if (captions.length === 0) {
      // Try fetching from background
      chrome.runtime.sendMessage(
        { type: "GET_DOWNLOAD_INFO", entryId },
        (resp: GetDownloadInfoResponse) => {
          if (resp?.captions?.length) {
            captions = resp.captions;
            downloadCaption(captions[0]);
          } else {
            showMsg("No subtitle found", "warn");
          }
        },
      );
      return;
    }
    downloadCaption(captions[0]);
  }

  function downloadCaption(caption: CaptionInfo): void {
    const title = getVideoTitle();
    const filename = `${title}.vtt`;

    showMsg("Downloading subtitle…", "info");

    window.postMessage(
      {
        source: MSG_TO_PAGE,
        type: "DOWNLOAD_SUBTITLE",
        url: caption.serveUrl,
        filename,
      },
      "*",
    );
  }

  // --- Copy m3u8 ---

  function onCopyClick(): void {
    if (!masterUrl) {
      showMsg("No URL yet", "warn");
      return;
    }

    navigator.clipboard.writeText(masterUrl).then(
      () => showMsg("Copied!", "ok"),
      () => {
        const input = document.createElement("input");
        input.value = masterUrl ?? "";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
        showMsg("Copied!", "ok");
      },
    );
  }

  // --- Progress ---

  function updateProgress(data: {
    phase: string;
    text: string;
    percent?: number;
  }): void {
    const fill = document.getElementById("kd-progress-fill");
    const text = document.getElementById("kd-progress-text");
    if (!fill || !text) return;

    const progressEl = document.getElementById("kd-progress");
    if (progressEl) progressEl.style.display = "block";
    text.textContent = data.text;

    if (data.phase === "downloading" && data.percent != null) {
      fill.style.width = `${data.percent}%`;
    } else if (data.phase === "merging" || data.phase === "saving") {
      fill.style.width = "100%";
    }
  }

  function onComplete(data: { sizeMB: string }): void {
    showMsg(`Done (${data.sizeMB} MB)`, "ok");
    const text = document.getElementById("kd-progress-text");
    if (text) text.textContent = `Done — ${data.sizeMB} MB`;
    resetUI();
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
