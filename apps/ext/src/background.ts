import { createIconImageData } from "./icon.js";
import { parseMasterPlaylist, parseMediaPlaylist } from "./parser.js";
import type {
  CaptionReadyMessage,
  CaptionInfo,
  GetDownloadInfoRequest,
  GetDownloadInfoResponse,
  ManifestInfo,
  ManifestReadyMessage,
  ReportHotmartManifestRequest,
  Variant,
} from "./types.js";

const store = new Map<string, ManifestInfo>();
const captionStore = new Map<string, CaptionInfo[]>();
const MANIFEST_STORAGE_PREFIX = "manifest:";
const CAPTION_STORAGE_PREFIX = "captions:";

function manifestStorageKey(key: string): string {
  return `${MANIFEST_STORAGE_PREFIX}${key}`;
}

function captionStorageKey(tabId: number): string {
  return `${CAPTION_STORAGE_PREFIX}${tabId}`;
}

async function persistManifest(key: string, info: ManifestInfo): Promise<void> {
  try {
    await chrome.storage.session.set({ [manifestStorageKey(key)]: info });
  } catch {
    // The in-memory cache remains usable if session storage is unavailable.
  }
}

async function persistCaptions(
  tabId: number,
  captions: CaptionInfo[],
): Promise<void> {
  try {
    await chrome.storage.session.set({
      [captionStorageKey(tabId)]: captions,
    });
  } catch {
    // The in-memory cache remains usable if session storage is unavailable.
  }
}

async function restoreTabState(
  tabId: number,
  entryId: string,
): Promise<{
  info?: ManifestInfo;
  captions: CaptionInfo[];
}> {
  try {
    const stored = await chrome.storage.session.get(null);
    const tabManifestPrefix = `${MANIFEST_STORAGE_PREFIX}${tabId}:`;
    let info: ManifestInfo | undefined;

    if (entryId) {
      info = stored[manifestStorageKey(`${tabId}:${entryId}`)] as
        | ManifestInfo
        | undefined;
    }
    const hasExactMatch = info !== undefined;

    for (const [storageKey, value] of Object.entries(stored)) {
      if (!storageKey.startsWith(tabManifestPrefix)) continue;
      const candidate = value as ManifestInfo;
      const key = storageKey.slice(MANIFEST_STORAGE_PREFIX.length);
      store.set(key, candidate);
      if (
        !hasExactMatch &&
        (!info || candidate.timestamp > info.timestamp)
      ) {
        info = candidate;
      }
    }

    const captions =
      (stored[captionStorageKey(tabId)] as CaptionInfo[] | undefined) ?? [];
    if (captions.length > 0) captionStore.set(String(tabId), captions);

    return { info, captions };
  } catch {
    return { captions: [] };
  }
}

async function clearStoredTabState(tabId: number): Promise<void> {
  try {
    const stored = await chrome.storage.session.get(null);
    const tabManifestPrefix = `${MANIFEST_STORAGE_PREFIX}${tabId}:`;
    const keys = Object.keys(stored).filter(
      (key) =>
        key.startsWith(tabManifestPrefix) || key === captionStorageKey(tabId),
    );
    if (keys.length > 0) await chrome.storage.session.remove(keys);
  } catch {
    // Session data expires with the browser session if cleanup fails.
  }
}

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

function handleHotmartManifest(tabId: number, url: string): void {
  let requestUrl: URL;
  try {
    requestUrl = new URL(url);
  } catch {
    return;
  }

  const isHotmartHost =
    requestUrl.hostname === "hotmart.com" ||
    requestUrl.hostname.endsWith(".hotmart.com");
  if (
    !isHotmartHost ||
    !["http:", "https:"].includes(requestUrl.protocol) ||
    !requestUrl.pathname.toLowerCase().endsWith(".m3u8")
  ) {
    return;
  }

  const entryId = requestUrl.pathname.match(/\/video\/([^/]+)\//)?.[1];
  if (!entryId) return;

  const key = `${tabId}:${entryId}`;
  let info = store.get(key);
  if (info) {
    info.timestamp = Date.now();
    info.masterUrl = url;
  } else {
    info = {
      entryId,
      partnerId: "hotmart",
      masterUrl: url,
      variants: [],
      timestamp: Date.now(),
    };
    store.set(key, info);
  }

  // Persist an immediately usable fallback before starting asynchronous
  // parsing. Firefox event backgrounds may be suspended after this listener
  // returns, and the page-context downloader can resolve a master playlist.
  mergeDirectVariant(info.variants, createDirectVariant(url));
  void persistManifest(key, info);

  chrome.action.enable(tabId);
  void fetchAndParseMaster(key, url, tabId, entryId);
}

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.tabId === -1) return;
    handleHotmartManifest(details.tabId, details.url);
  },
  { urls: ["*://*.hotmart.com/*"] },
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
    void persistCaptions(details.tabId, existing);

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
    await persistManifest(key, info);

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
    msg: GetDownloadInfoRequest | ReportHotmartManifestRequest,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: GetDownloadInfoResponse) => void,
  ) => {
    if (msg.type === "REPORT_HOTMART_MANIFEST") {
      const tabId = sender.tab?.id;
      if (tabId == null || !sender.url) return;

      try {
        const senderHost = new URL(sender.url).hostname;
        if (
          senderHost !== "hotmart.com" &&
          !senderHost.endsWith(".hotmart.com")
        ) {
          return;
        }
      } catch {
        return;
      }

      handleHotmartManifest(tabId, msg.url);
      return;
    }

    if (msg.type !== "GET_DOWNLOAD_INFO") return;

    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false });
      return;
    }

    const exact = msg.entryId ? store.get(`${tabId}:${msg.entryId}`) : undefined;
    const info = exact ?? findLatestManifest(tabId);
    if (!info || info.variants.length === 0) {
      void restoreTabState(tabId, msg.entryId).then((restored) => {
        if (!restored.info || restored.info.variants.length === 0) {
          sendResponse({ ok: false });
          return;
        }

        sendResponse({
          ok: true,
          masterUrl: restored.info.masterUrl,
          variants: restored.info.variants.map((v) => ({
            url: v.url,
            label: v.label,
            resolution: v.resolution,
            bandwidth: v.bandwidth,
          })),
          captions: restored.captions,
        });
      });
      return true;
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
  void clearStoredTabState(tabId);
});
