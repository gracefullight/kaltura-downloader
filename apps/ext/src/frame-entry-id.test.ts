import { describe, expect, it } from "vitest";
import { resolveFrameEntryId } from "./frame-entry-id.js";

describe("resolveFrameEntryId", () => {
  it("parses Kaltura entryId paths", () => {
    expect(
      resolveFrameEntryId(
        "/p/100/sp/10000/embedIframeJs/uiconf_id/1/partner_id/100/entryid/1_abc123/",
      ),
    ).toBe("1_abc123");
    expect(resolveFrameEntryId("/entryId/1_XYZ/")).toBe("1_XYZ");
  });

  it("parses Hotmart embed paths used on multi-video Teachable lectures", () => {
    expect(resolveFrameEntryId("/embed/DZmJ4jnNRz")).toBe("DZmJ4jnNRz");
    expect(resolveFrameEntryId("/embed/rRA30gkdL1?token=abc")).toBe("rRA30gkdL1");
  });

  it("parses Hotmart video CDN paths", () => {
    expect(
      resolveFrameEntryId("/video/rRA30gkdL1/hls/master-pkg-t-1.m3u8"),
    ).toBe("rRA30gkdL1");
  });

  it("returns empty for host pages without a video id", () => {
    expect(resolveFrameEntryId("/courses/2989232/lectures/65986203")).toBe("");
    expect(resolveFrameEntryId("/")).toBe("");
  });
});
