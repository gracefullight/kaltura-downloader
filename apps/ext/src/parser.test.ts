import { describe, expect, it } from "vitest";
import { parseMasterPlaylist, parseVariantPlaylist } from "./parser.js";

describe("parseMasterPlaylist", () => {
  it("parses variants with absolute URLs", () => {
    const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
https://cfvod.kaltura.com/hls/flavor1/index.m3u8?Policy=abc
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
https://cfvod.kaltura.com/hls/flavor2/index.m3u8?Policy=abc`;

    const variants = parseMasterPlaylist(m3u8, "https://cfvod.kaltura.com/master.m3u8");

    expect(variants).toHaveLength(2);
    // Sorted by bandwidth descending
    expect(variants[0].bandwidth).toBe(3000000);
    expect(variants[0].resolution).toBe("1920x1080");
    expect(variants[0].height).toBe(1080);
    expect(variants[0].label).toBe("1080p");
    expect(variants[0].url).toBe(
      "https://cfvod.kaltura.com/hls/flavor1/index.m3u8?Policy=abc",
    );

    expect(variants[1].bandwidth).toBe(1500000);
    expect(variants[1].label).toBe("720p");
  });

  it("parses variants with relative URLs", () => {
    const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
720p/index.m3u8`;

    const variants = parseMasterPlaylist(
      m3u8,
      "https://cdn.example.com/videos/master.m3u8",
    );

    expect(variants).toHaveLength(1);
    expect(variants[0].url).toBe("https://cdn.example.com/videos/720p/index.m3u8");
  });

  it("returns empty array for a media playlist (no STREAM-INF)", () => {
    const m3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg-1.ts
#EXTINF:10.0,
seg-2.ts
#EXT-X-ENDLIST`;

    const variants = parseMasterPlaylist(m3u8, "https://cdn.example.com/variant.m3u8");
    expect(variants).toHaveLength(0);
  });

  it("sorts variants by bandwidth descending", () => {
    const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
https://cdn.example.com/360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080
https://cdn.example.com/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720
https://cdn.example.com/720p.m3u8`;

    const variants = parseMasterPlaylist(m3u8, "https://cdn.example.com/m.m3u8");

    expect(variants.map((v) => v.label)).toEqual(["1080p", "720p", "360p"]);
  });

  it("falls back to kbps label when no resolution", () => {
    const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=128000
https://cdn.example.com/audio.m3u8`;

    const variants = parseMasterPlaylist(m3u8, "https://cdn.example.com/m.m3u8");

    expect(variants[0].label).toBe("128kbps");
    expect(variants[0].resolution).toBe("unknown");
  });

  it("skips lines starting with # after STREAM-INF", () => {
    const m3u8 = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
#EXT-X-SOME-TAG:value
https://cdn.example.com/480p.m3u8`;

    const variants = parseMasterPlaylist(m3u8, "https://cdn.example.com/m.m3u8");
    // The line after STREAM-INF is another tag, so this variant is skipped
    expect(variants).toHaveLength(0);
  });
});

describe("parseVariantPlaylist", () => {
  it("parses absolute segment URLs", () => {
    const m3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
https://cfvod.kaltura.com/seg-1.ts?Policy=abc
#EXTINF:10.0,
https://cfvod.kaltura.com/seg-2.ts?Policy=abc
#EXT-X-ENDLIST`;

    const segments = parseVariantPlaylist(m3u8, "https://cfvod.kaltura.com/variant.m3u8");

    expect(segments).toEqual([
      "https://cfvod.kaltura.com/seg-1.ts?Policy=abc",
      "https://cfvod.kaltura.com/seg-2.ts?Policy=abc",
    ]);
  });

  it("resolves relative segment URLs against the variant base", () => {
    const m3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
seg-1-v1-a1.ts?Policy=xyz&Signature=abc
#EXTINF:8.5,
seg-2-v1-a1.ts?Policy=xyz&Signature=abc
#EXT-X-ENDLIST`;

    const segments = parseVariantPlaylist(
      m3u8,
      "https://cfvod.kaltura.com/scf/hls/p/2300331/sp/230033100/serveFlavor/entryId/1_1aijqe6f/v/1/ev/5/flavorId/1_sipxyvio/name/a.mp4/index.m3u8?Policy=old",
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]).toContain(
      "https://cfvod.kaltura.com/scf/hls/p/2300331/sp/230033100/serveFlavor/entryId/1_1aijqe6f/v/1/ev/5/flavorId/1_sipxyvio/name/a.mp4/seg-1-v1-a1.ts",
    );
    expect(segments[0]).toContain("Policy=xyz");
  });

  it("returns empty array for empty playlist", () => {
    const m3u8 = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-ENDLIST`;

    const segments = parseVariantPlaylist(m3u8, "https://cdn.example.com/v.m3u8");
    expect(segments).toHaveLength(0);
  });

  it("skips comment and empty lines", () => {
    const m3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10

#EXTINF:10.0,

seg-1.ts

#EXT-X-ENDLIST
`;

    const segments = parseVariantPlaylist(m3u8, "https://cdn.example.com/v.m3u8");
    expect(segments).toHaveLength(1);
    expect(segments[0]).toBe("https://cdn.example.com/seg-1.ts");
  });

  it("handles a real Kaltura CloudFront segment pattern", () => {
    const m3u8 = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:1
#EXTINF:10.000,
seg-1-v1-a1.ts?Policy=eyJ&Signature=fGzx&Key-Pair-Id=APKAJT
#EXTINF:10.000,
seg-2-v1-a1.ts?Policy=eyJ&Signature=fGzx&Key-Pair-Id=APKAJT
#EXTINF:10.000,
seg-3-v1-a1.ts?Policy=eyJ&Signature=fGzx&Key-Pair-Id=APKAJT
#EXT-X-ENDLIST`;

    const base =
      "https://cfvod.kaltura.com/scf/hls/p/2300331/sp/230033100/serveFlavor/entryId/1_1aijqe6f/v/1/ev/5/flavorId/1_sipxyvio/name/a.mp4/index.m3u8?Policy=old";

    const segments = parseVariantPlaylist(m3u8, base);

    expect(segments).toHaveLength(3);
    // Each segment should have the full CloudFront path + its own query params
    for (const seg of segments) {
      expect(seg).toMatch(/\/name\/a\.mp4\/seg-\d+-v1-a1\.ts\?Policy=eyJ/);
      expect(seg).toContain("Key-Pair-Id=APKAJT");
    }
  });
});
