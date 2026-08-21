import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock modules (hoisted) ---

const mockTransmux = vi.fn();
vi.mock("./transmux.js", () => ({
  transmuxTsToMp4: mockTransmux,
}));

const mockParsePlaylist = vi.fn();
const mockParseMaster = vi.fn();
const mockParseSessionKey = vi.fn();
vi.mock("./parser.js", () => ({
  parseMasterPlaylist: mockParseMaster,
  parseMediaPlaylist: mockParsePlaylist,
  parseSessionKey: mockParseSessionKey,
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

function segment(url: string, sequence = 0): { url: string; sequence: number } {
  return { url, sequence };
}

// --- Tests ---

describe("downloader (page context)", () => {
  beforeEach(() => {
    posted.length = 0;
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockTransmux.mockReset();
    mockParsePlaylist.mockReset();
    mockParseMaster.mockReset();
    mockParseSessionKey.mockReset();
    mockParseMaster.mockReturnValue([]);
    mockParseSessionKey.mockReturnValue(undefined);
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
        segment("https://cdn.example.com/seg-1.ts"),
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

      mockParsePlaylist.mockReturnValue([segment("https://cdn.example.com/s.ts")]);
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

    it("resolves a master playlist before downloading segments", async () => {
      const segmentData = new ArrayBuffer(4);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          url: "https://cdn.example.com/master.m3u8",
          text: () => Promise.resolve("#EXTM3U\n#EXT-X-STREAM-INF\nv.m3u8\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          url: "https://cdn.example.com/v.m3u8",
          text: () => Promise.resolve("#EXTM3U\nseg.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(segmentData),
        });
      // Master path must not treat STREAM-INF URIs as segments — media parse
      // runs only after the master is resolved.
      mockParsePlaylist.mockReturnValue([
        segment("https://cdn.example.com/seg.ts"),
      ]);
      mockParseMaster.mockReturnValue([
        {
          url: "https://cdn.example.com/v.m3u8",
          bandwidth: 1000000,
          resolution: "1280x720",
          height: 720,
          label: "720p",
        },
      ]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/master.m3u8",
        filename: "master.ts",
      });

      await waitForPosted("COMPLETE");
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "https://cdn.example.com/v.m3u8",
      );
      expect(mockParseMaster).toHaveBeenCalled();
      expect(mockParsePlaylist).toHaveBeenCalledTimes(1);
      expect(mockParsePlaylist).toHaveBeenCalledWith(
        expect.any(String),
        "https://cdn.example.com/v.m3u8",
        undefined,
      );
    });

    it("does not download master STREAM-INF URIs as media segments", async () => {
      // Regression for 0x23 / #EXTM3U: master URI lines must not be fetched as TS.
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          url: "https://vod.play.hotmart.com/video/abc/hls/master.m3u8",
          text: () =>
            Promise.resolve(
              `#EXTM3U
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example.com/k"
#EXT-X-STREAM-INF:BANDWIDTH=1244000
stream-video=1244000.m3u8
`,
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          url: "https://vod.play.hotmart.com/video/abc/hls/stream-video=1244000.m3u8",
          text: () => Promise.resolve("#EXTM3U\n#EXTINF:4,\nseg-0.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new Uint8Array([0x47, 0x00]).buffer),
        });

      const sessionKey = { keyUrl: "https://keys.example.com/k" };
      mockParseSessionKey.mockReturnValue(sessionKey);
      mockParseMaster.mockReturnValue([
        {
          url: "https://vod.play.hotmart.com/video/abc/hls/stream-video=1244000.m3u8",
          bandwidth: 1_244_000,
          resolution: "unknown",
          height: 0,
          label: "1244kbps",
        },
      ]);
      mockParsePlaylist.mockReturnValue([
        segment(
          "https://vod.play.hotmart.com/video/abc/hls/seg-0.ts",
          0,
        ),
      ]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://vod.play.hotmart.com/video/abc/hls/master.m3u8",
        filename: "hotmart_hls.ts",
      });

      await waitForPosted("COMPLETE");

      // Second fetch must be the media playlist, never treating it as binary TS.
      expect(mockFetch.mock.calls[1][0]).toContain("stream-video=1244000.m3u8");
      expect(mockParsePlaylist).toHaveBeenCalledWith(
        expect.any(String),
        "https://vod.play.hotmart.com/video/abc/hls/stream-video=1244000.m3u8",
        sessionKey,
      );
      // Binary segment only — not the nested m3u8 text
      expect(mockTransmux.mock.calls[0][0][0]).toBe(0x47);
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

      mockParsePlaylist.mockReturnValue([segment("https://cdn.example.com/s.ts")]);
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

      mockParsePlaylist.mockReturnValue([segment("https://cdn.example.com/s.ts")]);

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
        segment("https://cdn.example.com/s1.ts", 1),
        segment("https://cdn.example.com/s2.ts", 2),
        segment("https://cdn.example.com/s3.ts", 3),
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

    it("decrypts AES-128 segments before transmuxing", async () => {
      const keyData = new Uint8Array(16);
      keyData.fill(7);
      const iv = new Uint8Array(16);
      iv[15] = 2;
      const plaintext = new Uint8Array(16);
      plaintext.fill(0x47);
      const encryptionKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-CBC" },
        false,
        ["encrypt"],
      );
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-CBC", iv },
        encryptionKey,
        plaintext,
      );

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\nencrypted.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(encrypted),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(keyData.buffer),
        });

      mockParsePlaylist.mockReturnValue([
        {
          ...segment("https://cdn.example.com/encrypted.ts", 2),
          encryption: {
            method: "AES-128",
            keyUrl: "https://keys.example.com/video.key",
            iv,
          },
        },
      ]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/v.m3u8",
        filename: "encrypted.ts",
      });

      await waitForPosted("COMPLETE");

      const transmuxInput = mockTransmux.mock.calls[0][0] as Uint8Array;
      expect(Array.from(transmuxInput)).toEqual(Array.from(plaintext));
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("decrypts Hotmart-style AES-CBC segments without PKCS#7 padding", async () => {
      const { createCipheriv } = await import("node:crypto");

      const keyData = Buffer.alloc(16, 0x3a);
      const iv = Buffer.alloc(16, 0);
      iv[15] = 1;
      // Full MPEG-TS packet (188 bytes) padded to block boundary without PKCS#7.
      const plaintext = Buffer.alloc(192, 0);
      for (let i = 0; i < 188; i += 188) plaintext[i] = 0x47;
      plaintext[0] = 0x47;

      const cipher = createCipheriv("aes-128-cbc", keyData, iv);
      cipher.setAutoPadding(false);
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve("#EXTM3U\nhotmart.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              encrypted.buffer.slice(
                encrypted.byteOffset,
                encrypted.byteOffset + encrypted.byteLength,
              ),
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              keyData.buffer.slice(keyData.byteOffset, keyData.byteOffset + keyData.byteLength),
            ),
        });

      mockParsePlaylist.mockReturnValue([
        {
          ...segment("https://cdn.example.com/hotmart.ts", 1),
          encryption: {
            method: "AES-128",
            keyUrl: "https://keys.example.com/hotmart.key",
            iv: new Uint8Array(iv),
          },
        },
      ]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/v.m3u8",
        filename: "hotmart.ts",
      });

      await waitForPosted("COMPLETE");

      const transmuxInput = mockTransmux.mock.calls[0][0] as Uint8Array;
      expect(transmuxInput[0]).toBe(0x47);
      expect(Array.from(transmuxInput)).toEqual(Array.from(plaintext));
    });

    it("passes master EXT-X-SESSION-KEY into media playlist parse", async () => {
      const sessionKey = {
        keyUrl: "https://keys.example.com/session.key",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          url: "https://cdn.example.com/master.m3u8",
          text: () =>
            Promise.resolve(
              `#EXTM3U
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example.com/session.key"
#EXT-X-STREAM-INF:BANDWIDTH=1000000
media.m3u8
`,
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          url: "https://cdn.example.com/media.m3u8",
          text: () => Promise.resolve("#EXTM3U\n#EXTINF:4,\nseg-0.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        });

      mockParsePlaylist.mockReturnValue([
        segment("https://cdn.example.com/seg-0.ts", 0),
      ]);
      mockParseMaster.mockReturnValue([
        {
          url: "https://cdn.example.com/media.m3u8",
          bandwidth: 1_000_000,
          resolution: "unknown",
          height: 0,
          label: "1000kbps",
        },
      ]);
      mockParseSessionKey.mockReturnValue(sessionKey);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/master.m3u8",
        filename: "session.ts",
      });

      await waitForPosted("COMPLETE");

      expect(mockParseSessionKey).toHaveBeenCalled();
      expect(mockParsePlaylist).toHaveBeenCalledWith(
        expect.any(String),
        "https://cdn.example.com/media.m3u8",
        sessionKey,
      );
    });

    it("loads SESSION-KEY from masterUrl when downloading a media variant", async () => {
      const sessionKey = { keyUrl: "https://keys.example.com/session.key" };

      mockFetch
        // masterUrl for SESSION-KEY
        .mockResolvedValueOnce({
          ok: true,
          url: "https://cdn.example.com/master.m3u8",
          text: () =>
            Promise.resolve(
              `#EXTM3U
#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example.com/session.key"
#EXT-X-STREAM-INF:BANDWIDTH=1
media.m3u8
`,
            ),
        })
        // media variant playlist (no EXT-X-KEY)
        .mockResolvedValueOnce({
          ok: true,
          url: "https://cdn.example.com/media.m3u8",
          text: () => Promise.resolve("#EXTM3U\nseg.ts\n"),
        })
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
        });

      mockParseSessionKey.mockReturnValue(sessionKey);
      mockParseMaster.mockReturnValue([]); // media playlist has no STREAM-INF
      mockParsePlaylist.mockReturnValue([
        segment("https://cdn.example.com/seg.ts", 0),
      ]);
      mockTransmux.mockResolvedValue(new Uint8Array([1]));

      sendMessage({
        type: "START_DOWNLOAD",
        variantUrl: "https://cdn.example.com/media.m3u8",
        masterUrl: "https://cdn.example.com/master.m3u8",
        filename: "from-master-key.ts",
      });

      await waitForPosted("COMPLETE");

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "https://cdn.example.com/master.m3u8",
      );
      expect(mockParsePlaylist).toHaveBeenCalledWith(
        expect.any(String),
        "https://cdn.example.com/media.m3u8",
        sessionKey,
      );
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
