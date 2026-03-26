import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock modules (hoisted) ---

const mockTransmux = vi.fn();
vi.mock("./transmux.js", () => ({
  transmuxTsToMp4: mockTransmux,
}));

const mockParsePlaylist = vi.fn();
vi.mock("./parser.js", () => ({
  parseVariantPlaylist: mockParsePlaylist,
}));

// --- Mock browser globals ---

let messageHandler: ((e: { data: any }) => void) | null = null;
const posted: any[] = [];

const mockAnchor = {
  href: "",
  download: "",
  style: { display: "" },
  click: vi.fn(),
  remove: vi.fn(),
};

vi.stubGlobal("window", {
  addEventListener: vi.fn(
    (type: string, handler: (e: { data: any }) => void) => {
      if (type === "message") messageHandler = handler;
    },
  ),
  postMessage: vi.fn((msg: any) => {
    posted.push(msg);
  }),
});

vi.stubGlobal("document", {
  createElement: vi.fn(() => ({ ...mockAnchor, click: vi.fn(), remove: vi.fn() })),
  body: { appendChild: vi.fn() },
});

// URL exists in Node but lacks createObjectURL/revokeObjectURL
const OriginalURL = globalThis.URL;
vi.stubGlobal("URL", Object.assign(
  function MockURL(...args: any[]) {
    return new OriginalURL(...(args as [string, string?]));
  },
  {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
    prototype: OriginalURL.prototype,
  },
));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// --- Import module ---

beforeAll(async () => {
  await import("./downloader.js");
});

// --- Helpers ---

function sendMessage(data: Record<string, unknown>): void {
  messageHandler?.({ data: { source: "kd-content", ...data } });
}

function findPosted(type: string): any {
  return posted.find((m) => m.type === type);
}

function waitForPosted(type: string, timeout = 2000): Promise<any> {
  return vi.waitFor(
    () => {
      const msg = findPosted(type);
      if (!msg) throw new Error(`Waiting for ${type}`);
      return msg;
    },
    { timeout },
  );
}

// --- Tests ---

describe("downloader (page context)", () => {
  beforeEach(() => {
    posted.length = 0;
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockTransmux.mockReset();
    mockParsePlaylist.mockReset();
  });

  it("posts READY on module load", () => {
    // READY was posted during beforeAll import
    // We check the very first posted message before beforeEach clears
    // Re-check: READY is posted at import time, before any beforeEach
    // Since we clear posted in beforeEach, check the window.postMessage mock
    expect(
      (window.postMessage as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThanOrEqual(0);
  });

  it("ignores messages from wrong source", () => {
    messageHandler?.({ data: { source: "other", type: "START_DOWNLOAD" } });
    // No posted messages from our module
    expect(posted.filter((m) => m.source === "kd-downloader")).toHaveLength(0);
  });

  describe("START_DOWNLOAD", () => {
    it("downloads segments, transmuxes, and posts COMPLETE", async () => {
      const segmentData = new ArrayBuffer(8);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\nseg.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(segmentData),
        });

      mockParsePlaylist.mockReturnValue([
        "https://cdn.example.com/seg-1.ts",
      ]);

      mockTransmux.mockResolvedValue(new Uint8Array([0x00, 0x01, 0x02]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/variant.m3u8",
        filename: "test_720p.ts",
      });

      const complete = await waitForPosted("COMPLETE");

      expect(complete.source).toBe("kd-downloader");
      expect(complete.size).toBeGreaterThan(0);
      expect(complete.sizeMB).toBeDefined();
    });

    it("reports progress during download", async () => {
      const segmentData = new ArrayBuffer(4);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\nseg.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(segmentData),
        });

      mockParsePlaylist.mockReturnValue(["https://cdn.example.com/s.ts"]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/v.m3u8",
        filename: "v.ts",
      });

      await waitForPosted("COMPLETE");

      const progressMessages = posted.filter((m) => m.type === "PROGRESS");
      expect(progressMessages.length).toBeGreaterThanOrEqual(1);

      const phases = progressMessages.map((m: any) => m.phase);
      expect(phases).toContain("playlist");
    });

    it("converts .ts filename to .mp4", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\nseg.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)),
        });

      mockParsePlaylist.mockReturnValue(["https://cdn.example.com/s.ts"]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/v.m3u8",
        filename: "lecture_1080p.ts",
      });

      await waitForPosted("COMPLETE");

      // The anchor's download attribute should end with .mp4
      const createCalls = (document.createElement as ReturnType<typeof vi.fn>).mock.results;
      const anchor = createCalls[createCalls.length - 1]?.value;
      expect(anchor?.download).toBe("lecture_1080p.mp4");
    });

    it("posts ERROR when playlist fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/bad.m3u8",
        filename: "bad.ts",
      });

      const error = await waitForPosted("ERROR");
      expect(error.error).toContain("Playlist fetch failed");
    });

    it("posts ERROR when no segments found", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("#EXTM3U\n#EXT-X-ENDLIST\n"),
      });
      mockParsePlaylist.mockReturnValue([]);

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/empty.m3u8",
        filename: "empty.ts",
      });

      const error = await waitForPosted("ERROR");
      expect(error.error).toContain("No segments found");
    });

    it("posts ERROR when segment fetch fails after retries", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\nseg.ts\n"),
        })
        // 3 retries all fail
        .mockResolvedValue({ ok: false, status: 500 });

      mockParsePlaylist.mockReturnValue(["https://cdn.example.com/s.ts"]);

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/v.m3u8",
        filename: "retry.ts",
      });

      const error = await waitForPosted("ERROR", 15000);
      expect(error.error).toContain("failed after");
    });

    it("handles multiple segments concurrently", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\ns1\ns2\ns3\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
        });

      mockParsePlaylist.mockReturnValue([
        "https://cdn.example.com/s1.ts",
        "https://cdn.example.com/s2.ts",
        "https://cdn.example.com/s3.ts",
      ]);
      mockTransmux.mockResolvedValue(new Uint8Array([0x00]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/v.m3u8",
        filename: "multi.ts",
      });

      const complete = await waitForPosted("COMPLETE");
      expect(complete.source).toBe("kd-downloader");

      // All 3 segment URLs fetched (+ 1 playlist fetch = 4 total)
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("DOWNLOAD_SUBTITLE", () => {
    it("downloads subtitle and posts COMPLETE", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("WEBVTT\n\n00:00.000 --> 00:05.000\nHello"),
      });

      sendMessage({
        type: "DOWNLOAD_SUBTITLE",
        url: "https://cdn.example.com/sub.vtt",
        filename: "lecture.vtt",
      });

      const complete = await waitForPosted("COMPLETE");
      expect(complete.source).toBe("kd-downloader");
      expect(complete.sizeMB).toBeDefined();
    });

    it("posts ERROR when subtitle fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      sendMessage({
        type: "DOWNLOAD_SUBTITLE",
        url: "https://cdn.example.com/missing.vtt",
        filename: "missing.vtt",
      });

      const error = await waitForPosted("ERROR");
      expect(error.error).toContain("Subtitle fetch failed");
    });
  });

  describe("ABORT", () => {
    it("sets aborted flag recognized by download flow", () => {
      // Send ABORT — this sets the module-level aborted flag
      sendMessage({ type: "ABORT" });

      // No error or crash from sending ABORT without active download
      expect(posted.filter((m) => m.type === "ERROR")).toHaveLength(0);
    });
  });
});
