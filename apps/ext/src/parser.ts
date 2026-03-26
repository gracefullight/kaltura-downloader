import type { Variant } from "./types.js";

/**
 * Parse an HLS master playlist to extract variant streams.
 * Each variant includes the URL, bandwidth, resolution, and a label.
 */
export function parseMasterPlaylist(text: string, baseUrl: string): Variant[] {
  const variants: Variant[] = [];
  const lines = text.split("\n");
  const base = baseUrl.replace(/[^/]*$/, "");

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;

    const bw = lines[i].match(/BANDWIDTH=(\d+)/)?.[1];
    const res = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
    const nextLine = (lines[i + 1] ?? "").trim();
    if (!nextLine || nextLine.startsWith("#")) continue;

    const variantUrl = nextLine.startsWith("http")
      ? nextLine
      : new URL(nextLine, base).href;

    const height = res ? parseInt(res.split("x")[1], 10) : 0;

    variants.push({
      url: variantUrl,
      bandwidth: parseInt(bw ?? "0", 10) || 0,
      resolution: res ?? "unknown",
      height,
      label: height
        ? `${height}p`
        : `${Math.round((parseInt(bw ?? "0", 10) || 0) / 1000)}kbps`,
    });
  }

  variants.sort((a, b) => b.bandwidth - a.bandwidth);
  return variants;
}

/**
 * Parse an HLS variant/media playlist to extract segment URLs.
 * Non-comment, non-empty lines are treated as segment references.
 */
export function parseVariantPlaylist(text: string, baseUrl: string): string[] {
  const base = baseUrl.replace(/[^/]*(\?.*)?$/, "");
  const segments: string[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    segments.push(trimmed.startsWith("http") ? trimmed : base + trimmed);
  }

  return segments;
}
