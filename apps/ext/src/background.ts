import { createIconImageData } from "./icon.js";
import { parseMasterPlaylist, parseMediaPlaylist } from "./parser.js";
import type {
  CaptionReadyMessage,
  CaptionInfo,
  GetDownloadInfoRequest,
  GetDownloadInfoResponse,
  ManifestInfo,
  ManifestReadyMessage,
  Variant,
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

    // Clear stale captions from previous video in this tab
    captionStore.delete(String(details.tabId));

    chrome.action.enable(details.tabId);
    fetchAndParseMaster(key, details.url, details.tabId, entryId);
  },
  { urls: ["*://*.kaltura.com/*playManifest*"] },
);

// --- Intercept standard Hotmart HLS manifests ---

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId === -1) return;

    const entryId = details.url.match(/\/video\/([^/]+)\//)?.[1];
    if (!entryId) return;

    const key = `${details.tabId}:${entryId}`;
    const existing = store.get(key);
    if (existing) {
      existing.timestamp = Date.now();
    } else {
      store.set(key, {
        entryId,
        partnerId: "hotmart",
        masterUrl: details.url,
        variants: [],
        timestamp: Date.now(),
      });
    }

    chrome.action.enable(details.tabId);
    fetchAndParseMaster(key, details.url, details.tabId, entryId);
  },
  { urls: ["*://*.hotmart.com/*.m3u8*"] },
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
    const masterVariants = parseMasterPlaylist(text, resp.url);
    const mediaSegments =
      masterVariants.length === 0 ? parseMediaPlaylist(text, resp.url) : [];
    if (masterVariants.length === 0 && mediaSegments.length === 0) return;

    const info = store.get(key);
    if (!info) return;

    if (masterVariants.length > 0) {
      info.variants = masterVariants;
      info.masterUrl = resp.url;
    } else {
      mergeDirectVariant(info.variants, createDirectVariant(resp.url));
    }
    info.finalUrl = resp.url;

    const msg: ManifestReadyMessage = {
      type: "MANIFEST_READY",
      entryId,
      variants: info.variants.map((v) => ({
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

function createDirectVariant(url: string): Variant {
  const videoBandwidth = Number.parseInt(url.match(/video=(\d+)/)?.[1] ?? "0", 10);
  return {
    url,
    bandwidth: videoBandwidth,
    resolution: "unknown",
    height: 0,
    label: videoBandwidth ? `${Math.round(videoBandwidth / 1000)}kbps` : "HLS",
  };
}

function mergeDirectVariant(variants: Variant[], direct: Variant): void {
  const directPath = new URL(direct.url).pathname;
  const existing = variants.find(
    (variant) => new URL(variant.url).pathname === directPath,
  );
  if (existing) {
    existing.url = direct.url;
    return;
  }
  variants.push(direct);
  variants.sort((a, b) => b.bandwidth - a.bandwidth);
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

    const exact = msg.entryId ? store.get(`${tabId}:${msg.entryId}`) : undefined;
    const info = exact ?? findLatestManifest(tabId);
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

function findLatestManifest(tabId: number): ManifestInfo | undefined {
  let latest: ManifestInfo | undefined;
  for (const [key, info] of store) {
    if (!key.startsWith(`${tabId}:`)) continue;
    if (!latest || info.timestamp > latest.timestamp) latest = info;
  }
  return latest;
}

// --- Cleanup on tab close ---

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of store.keys()) {
    if (key.startsWith(`${tabId}:`)) store.delete(key);
  }
  captionStore.delete(String(tabId));
});
