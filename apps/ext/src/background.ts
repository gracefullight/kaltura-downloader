import { createIconImageData } from "./icon.js";
import { parseMasterPlaylist } from "./parser.js";
import type {
  GetDownloadInfoRequest,
  GetDownloadInfoResponse,
  ManifestInfo,
  ManifestReadyMessage,
} from "./types.js";

const store = new Map<string, ManifestInfo>();

// --- Icon activation: grey by default, active on KAF pages ---

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setIcon({ imageData: createIconImageData() });
  chrome.action.disable();

  chrome.declarativeContent.onPageChanged.removeRules(undefined, () => {
    chrome.declarativeContent.onPageChanged.addRules([
      {
        conditions: [
          new chrome.declarativeContent.PageStateMatcher({
            pageUrl: { hostSuffix: ".kaf.kaltura.com" },
          }),
        ],
        actions: [new chrome.declarativeContent.ShowAction()],
      },
    ]);
  });
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

    fetchAndParseMaster(key, details.url, details.tabId, entryId);
  },
  { urls: ["*://*.kaltura.com/*playManifest*"] },
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

    sendResponse({
      ok: true,
      masterUrl: info.masterUrl,
      variants: info.variants.map((v) => ({
        url: v.url,
        label: v.label,
        resolution: v.resolution,
        bandwidth: v.bandwidth,
      })),
    });
  },
);

// --- Cleanup on tab close ---

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of store.keys()) {
    if (key.startsWith(`${tabId}:`)) store.delete(key);
  }
});
