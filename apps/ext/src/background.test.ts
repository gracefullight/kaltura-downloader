import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock dependencies (hoisted) ---

vi.mock("./icon.js", () => ({
  createIconImageData: vi.fn(() => ({ "16": {}, "32": {} })),
}));

vi.mock("./parser.js", () => ({
  parseMasterPlaylist: vi.fn(() => []),
}));

import { parseMasterPlaylist } from "./parser.js";
const mockParse = parseMasterPlaylist as ReturnType<typeof vi.fn>;

// --- Mock Chrome APIs & capture listeners ---

type Listener = (...args: any[]) => any;
const webRequestCbs: Array<{ cb: Listener; filter: any }> = [];
let onInstalledCb: Listener;
let onMessageCb: Listener;
let onRemovedCb: Listener;

vi.stubGlobal("chrome", {
  runtime: {
    onInstalled: {
      addListener: vi.fn((cb: Listener) => {
        onInstalledCb = cb;
      }),
    },
    onMessage: {
      addListener: vi.fn((cb: Listener) => {
        onMessageCb = cb;
      }),
    },
  },
  action: {
    setIcon: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
  },
  webRequest: {
    onCompleted: {
      addListener: vi.fn((cb: Listener, filter: any) => {
        webRequestCbs.push({ cb, filter });
      }),
    },
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onRemoved: {
      addListener: vi.fn((cb: Listener) => {
        onRemovedCb = cb;
      }),
    },
  },
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// --- Import module (triggers side-effect listener registration) ---

beforeAll(async () => {
  await import("./background.js");
});

// --- Helpers ---

const playManifest = () => webRequestCbs[0].cb;
const captionHandler = () => webRequestCbs[1].cb;

function makePlayManifestUrl(
  partnerId: string,
  entryId: string,
): string {
  return `https://cdnapisec.kaltura.com/p/${partnerId}/sp/${partnerId}00/playManifest/entryId/${entryId}/format/applehttp/a.m3u8`;
}

function makeCaptionUrl(
  captionAssetId: string,
  ks: string,
): string {
  return `https://cdnapisec.kaltura.com/api_v3/service/caption_captionasset/action/serve/captionAssetId/${captionAssetId}/ks/${ks}/format/1`;
}

// --- Tests ---

describe("background service worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParse.mockReturnValue([]);
    mockFetch.mockReset();
  });

  describe("onInstalled", () => {
    it("sets icon and disables action", () => {
      onInstalledCb();
      expect(chrome.action.setIcon).toHaveBeenCalled();
      expect(chrome.action.disable).toHaveBeenCalled();
    });
  });

  describe("playManifest interceptor", () => {
    it("registers with correct URL filter", () => {
      expect(webRequestCbs[0].filter).toEqual({
        urls: ["*://*.kaltura.com/*playManifest*"],
      });
    });

    it("ignores requests with tabId -1", () => {
      playManifest()({ tabId: -1, url: makePlayManifestUrl("123", "1_abc") });
      expect(chrome.action.enable).not.toHaveBeenCalled();
    });

    it("ignores URLs without /playManifest/", () => {
      playManifest()({
        tabId: 1,
        url: "https://cdnapisec.kaltura.com/p/123/other",
      });
      expect(chrome.action.enable).not.toHaveBeenCalled();
    });

    it("ignores URLs without format/applehttp", () => {
      playManifest()({
        tabId: 1,
        url: "https://cdnapisec.kaltura.com/p/123/playManifest/entryId/1_abc/format/url",
      });
      expect(chrome.action.enable).not.toHaveBeenCalled();
    });

    it("ignores URLs missing entryId", () => {
      playManifest()({
        tabId: 1,
        url: "https://cdnapisec.kaltura.com/p/123/playManifest/format/applehttp",
      });
      expect(chrome.action.enable).not.toHaveBeenCalled();
    });

    it("ignores URLs missing partnerId", () => {
      playManifest()({
        tabId: 1,
        url: "https://cdnapisec.kaltura.com/playManifest/entryId/1_abc/format/applehttp",
      });
      expect(chrome.action.enable).not.toHaveBeenCalled();
    });

    it("enables action and sends MANIFEST_READY on valid URL", async () => {
      const variants = [
        {
          url: "https://cdn.example.com/720p.m3u8",
          bandwidth: 1000000,
          resolution: "1280x720",
          height: 720,
          label: "720p",
        },
      ];
      mockParse.mockReturnValue(variants);
      mockFetch.mockResolvedValue({
        ok: true,
        url: "https://cdnapisec.kaltura.com/p/100/playManifest/entryId/1_valid/format/applehttp/master.m3u8",
        text: () => Promise.resolve("#EXTM3U\n"),
      });

      playManifest()({ tabId: 10, url: makePlayManifestUrl("100", "1_valid") });

      expect(chrome.action.enable).toHaveBeenCalledWith(10);

      await vi.waitFor(() => {
        expect(chrome.tabs.sendMessage).toHaveBeenCalled();
      });

      const [tabId, msg] = (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>)
        .mock.calls[0];
      expect(tabId).toBe(10);
      expect(msg.type).toBe("MANIFEST_READY");
      expect(msg.entryId).toBe("1_valid");
      expect(msg.variants).toEqual([
        expect.objectContaining({ label: "720p", bandwidth: 1000000 }),
      ]);
    });

    it("does not send message when fetch fails", async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });

      playManifest()({ tabId: 11, url: makePlayManifestUrl("200", "1_fail") });

      await new Promise((r) => setTimeout(r, 50));
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it("does not send message when fetch throws", async () => {
      mockFetch.mockRejectedValue(new Error("network"));

      playManifest()({ tabId: 12, url: makePlayManifestUrl("300", "1_err") });

      await new Promise((r) => setTimeout(r, 50));
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("caption interceptor", () => {
    it("registers with correct URL filter", () => {
      expect(webRequestCbs[1].filter).toEqual({
        urls: ["*://*.kaltura.com/*caption_captionasset*"],
      });
    });

    it("ignores requests with tabId -1", () => {
      captionHandler()({ tabId: -1, url: makeCaptionUrl("1_cap", "ks1") });
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it("ignores URLs missing captionAssetId", () => {
      captionHandler()({
        tabId: 20,
        url: "https://cdnapisec.kaltura.com/caption_captionasset/ks/abc",
      });
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it("ignores URLs missing ks", () => {
      captionHandler()({
        tabId: 20,
        url: "https://cdnapisec.kaltura.com/caption_captionasset/captionAssetId/1_x",
      });
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    it("sends CAPTION_READY on valid caption URL", () => {
      captionHandler()({ tabId: 21, url: makeCaptionUrl("1_sub1", "myks") });

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        21,
        expect.objectContaining({
          type: "CAPTION_READY",
          captionAssetId: "1_sub1",
        }),
      );
    });

    it("deduplicates captions by captionAssetId", () => {
      const url = makeCaptionUrl("1_dup", "ks_dup");
      captionHandler()({ tabId: 22, url });
      captionHandler()({ tabId: 22, url });

      const calls = (
        chrome.tabs.sendMessage as ReturnType<typeof vi.fn>
      ).mock.calls.filter((c: any[]) => c[0] === 22);
      expect(calls).toHaveLength(1);
    });

    it("allows different captionAssetIds on same tab", () => {
      captionHandler()({ tabId: 23, url: makeCaptionUrl("1_capA", "ks_a") });
      captionHandler()({ tabId: 23, url: makeCaptionUrl("1_capB", "ks_b") });

      const calls = (
        chrome.tabs.sendMessage as ReturnType<typeof vi.fn>
      ).mock.calls.filter((c: any[]) => c[0] === 23);
      expect(calls).toHaveLength(2);
    });
  });

  describe("GET_DOWNLOAD_INFO handler", () => {
    it("ignores non-GET_DOWNLOAD_INFO messages", () => {
      const sendResponse = vi.fn();
      onMessageCb({ type: "OTHER" }, { tab: { id: 1 } }, sendResponse);
      expect(sendResponse).not.toHaveBeenCalled();
    });

    it("returns ok: false when no tab id", () => {
      const sendResponse = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_x" },
        { tab: undefined },
        sendResponse,
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    });

    it("returns ok: false when no tab.id", () => {
      const sendResponse = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_x" },
        { tab: {} },
        sendResponse,
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    });

    it("returns ok: false when store has no entry", () => {
      const sendResponse = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_missing" },
        { tab: { id: 999 } },
        sendResponse,
      );
      expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    });

    it("returns ok: true with variants after manifest stored", async () => {
      const variants = [
        {
          url: "https://cdn.example.com/1080p.m3u8",
          bandwidth: 3000000,
          resolution: "1920x1080",
          height: 1080,
          label: "1080p",
        },
      ];
      mockParse.mockReturnValue(variants);
      mockFetch.mockResolvedValue({
        ok: true,
        url: "https://cdnapisec.kaltura.com/final.m3u8",
        text: () => Promise.resolve("#EXTM3U\n"),
      });

      playManifest()({
        tabId: 30,
        url: makePlayManifestUrl("500", "1_info"),
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      // Wait for async parse to settle
      await new Promise((r) => setTimeout(r, 50));

      const sendResponse = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_info" },
        { tab: { id: 30 } },
        sendResponse,
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          variants: [
            expect.objectContaining({ label: "1080p", bandwidth: 3000000 }),
          ],
        }),
      );
    });

    it("includes captions in response", async () => {
      // Populate store with a manifest
      const variants = [
        {
          url: "https://cdn.example.com/v.m3u8",
          bandwidth: 1000000,
          resolution: "1280x720",
          height: 720,
          label: "720p",
        },
      ];
      mockParse.mockReturnValue(variants);
      mockFetch.mockResolvedValue({
        ok: true,
        url: "https://cdnapisec.kaltura.com/final.m3u8",
        text: () => Promise.resolve("#EXTM3U\n"),
      });

      playManifest()({
        tabId: 31,
        url: makePlayManifestUrl("600", "1_withcap"),
      });

      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
      await new Promise((r) => setTimeout(r, 50));

      // Add a caption for the same tab
      vi.clearAllMocks();
      captionHandler()({
        tabId: 31,
        url: makeCaptionUrl("1_capt", "ks_val"),
      });

      const sendResponse = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_withcap" },
        { tab: { id: 31 } },
        sendResponse,
      );

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          captions: expect.arrayContaining([
            expect.objectContaining({ captionAssetId: "1_capt" }),
          ]),
        }),
      );
    });
  });

  describe("tab cleanup", () => {
    it("removes store entries on tab close", async () => {
      const variants = [
        {
          url: "https://cdn.example.com/v.m3u8",
          bandwidth: 1000000,
          resolution: "1280x720",
          height: 720,
          label: "720p",
        },
      ];
      mockParse.mockReturnValue(variants);
      mockFetch.mockResolvedValue({
        ok: true,
        url: "https://cdnapisec.kaltura.com/final.m3u8",
        text: () => Promise.resolve("#EXTM3U\n"),
      });

      playManifest()({
        tabId: 40,
        url: makePlayManifestUrl("700", "1_clean"),
      });

      await new Promise((r) => setTimeout(r, 50));

      // Verify entry exists
      const resp1 = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_clean" },
        { tab: { id: 40 } },
        resp1,
      );
      expect(resp1).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));

      // Close tab
      onRemovedCb(40);

      // Verify entry removed
      const resp2 = vi.fn();
      onMessageCb(
        { type: "GET_DOWNLOAD_INFO", entryId: "1_clean" },
        { tab: { id: 40 } },
        resp2,
      );
      expect(resp2).toHaveBeenCalledWith({ ok: false });
    });
  });
});
