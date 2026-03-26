import { createIconImageData } from "./icon.js";
import { parseMasterPlaylist } from "./parser.js";
import type {
  CaptionInfo,
  GetDownloadInfoRequest,
  GetDownloadInfoResponse,
  ManifestInfo,
  ManifestReadyMessage,
  CaptionReadyMessage,
} from "./types.js";

const store = new Map<string, ManifestInfo>();
const captionStore = new Map<string, CaptionInfo[]>();

// --- Icon: disabled by default, activated per-tab on manifest detection ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setIcon({ imageData: createIconImageData() });
  chrome.action.disable();
});

// --- Intercept master m3u8 from playManifest ---

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId === -1) return;
    if (!details.url.includes("/playManifest/")) return;
    if (!details.url.includes("format/applehttp")) return;

    const entryId = details.url.match(/entryId\/([^/]+)/)?.[1];
    const partnerId = details.url.match(/\/p\/(\d+)/)?.[1];
    if (!entryId || !partnerId) return;

    const key = `${details.tabId}:${entryId}`;

    store.set(key, {
      entryId,
      partnerId,
      masterUrl: details.url,
      variants: [],
      timestamp: Date.now(),
    });

    chrome.action.enable(details.tabId);
    fetchAndParseMaster(key, details.url, details.tabId, entryId);
  },
  { urls: ["*://*.kaltura.com/*playManifest*"] },
);

// --- Intercept caption/subtitle WebVTT requests ---

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId === -1) return;
    if (!details.url.includes("caption_captionasset")) return;

    const captionAssetId = details.url.match(
      /captionAssetId\/([^/]+)/,
    )?.[1];
    const ks = details.url.match(/\/ks\/([^/]+)/)?.[1];
    if (!captionAssetId || !ks) return;

    const tabKey = String(details.tabId);
    const existing = captionStore.get(tabKey) ?? [];

    // Dedupe by captionAssetId
    if (existing.some((c) => c.captionAssetId === captionAssetId)) return;

    const baseUrl = new URL(details.url).origin;
    // serveWebVTT with large segmentDuration so segment 1 covers the entire video
    const serveUrl = `${baseUrl}/api_v3/index.php/service/caption_captionasset/action/serveWebVTT/captionAssetId/${captionAssetId}/segmentDuration/86400/ks/${ks}/segmentIndex/1.vtt`;

    existing.push({ captionAssetId, ks, baseUrl, serveUrl });
    captionStore.set(tabKey, existing);

    const msg: CaptionReadyMessage = {
      type: "CAPTION_READY",
      captionAssetId,
    };
    chrome.tabs.sendMessage(details.tabId, msg).catch(() => {});
  },
  { urls: ["*://*.kaltura.com/*caption_captionasset*"] },
);

// --- Fetch & parse the master m3u8 ---

async function fetchAndParseMaster(
  key: string,
  masterUrl: string,
  tabId: number,
  entryId: string,
): Promise<void> {
  try {
    const resp = await fetch(masterUrl, { redirect: "follow" });
    if (!resp.ok) return;

    const text = await resp.text();
    const variants = parseMasterPlaylist(text, resp.url);

    const info = store.get(key);
    if (info) {
      info.variants = variants;
      info.finalUrl = resp.url;
    }

    const msg: ManifestReadyMessage = {
      type: "MANIFEST_READY",
      entryId,
      variants: variants.map((v) => ({
        label: v.label,
        resolution: v.resolution,
        bandwidth: v.bandwidth,
      })),
    };

    chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  } catch {
    // Non-critical
  }
}

// --- Message handling ---

chrome.runtime.onMessage.addListener(
  (
    msg: GetDownloadInfoRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: GetDownloadInfoResponse) => void,
  ) => {
    if (msg.type !== "GET_DOWNLOAD_INFO") return;

    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return;
    }

    const info = store.get(`${tabId}:${msg.entryId}`);
    if (!info || info.variants.length === 0) {
      sendResponse({ ok: false });
      return;
    }

    const captions = captionStore.get(String(tabId)) ?? [];

    sendResponse({
      ok: true,
      masterUrl: info.masterUrl,
      variants: info.variants.map((v) => ({
        url: v.url,
        label: v.label,
        resolution: v.resolution,
        bandwidth: v.bandwidth,
      })),
      captions,
    });
  },
);

// --- Cleanup on tab close ---

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of store.keys()) {
    if (key.startsWith(`${tabId}:`)) store.delete(key);
  }
  captionStore.delete(String(tabId));
});
