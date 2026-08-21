import type { Variant } from "./types.js";

export interface HlsEncryption {
  method: "AES-128";
  keyUrl: string;
  iv: Uint8Array<ArrayBuffer>;
}

export interface HlsKeyRef {
  keyUrl: string;
  explicitIv?: Uint8Array<ArrayBuffer>;
}

export interface HlsSegment {
  url: string;
  sequence: number;
  encryption?: HlsEncryption;
}

/**
 * Parse an HLS master playlist to extract variant streams.
 * Each variant includes the URL, bandwidth, resolution, and a label.
 */
export function parseMasterPlaylist(text: string, baseUrl: string): Variant[] {
  const variants: Variant[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;

    const bw = lines[i].match(/BANDWIDTH=(\d+)/)?.[1];
    const res = lines[i].match(/RESOLUTION=(\d+x\d+)/)?.[1];
    const nextLine = (lines[i + 1] ?? "").trim();
    if (!nextLine || nextLine.startsWith("#")) continue;

    const variantUrl = new URL(nextLine, baseUrl).href;

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
 * Parse the first AES-128 EXT-X-SESSION-KEY from a master playlist.
 * Hotmart (and some CDNs) advertise encryption only here; media playlists
 * may omit EXT-X-KEY and expect clients to inherit the session key.
 */
export function parseSessionKey(
  text: string,
  baseUrl: string,
): HlsKeyRef | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("#EXT-X-SESSION-KEY:")) continue;

    const key = parseAes128KeyTag(trimmed.slice("#EXT-X-SESSION-KEY:".length), baseUrl);
    if (key) return key;
  }
  return undefined;
}

/**
 * Parse an HLS media playlist, including AES-128 key rotation and IV rules.
 * Optional `defaultKey` is used until the playlist defines its own EXT-X-KEY
 * (or METHOD=NONE clears it) — typically from master EXT-X-SESSION-KEY.
 */
export function parseMediaPlaylist(
  text: string,
  baseUrl: string,
  defaultKey?: HlsKeyRef,
): HlsSegment[] {
  const segments: HlsSegment[] = [];
  let mediaSequence = 0;
  let segmentIndex = 0;
  let currentKey: HlsKeyRef | undefined = defaultKey
    ? {
        keyUrl: defaultKey.keyUrl,
        explicitIv: defaultKey.explicitIv
          ? new Uint8Array(defaultKey.explicitIv)
          : undefined,
      }
    : undefined;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      const parsed = Number.parseInt(trimmed.slice("#EXT-X-MEDIA-SEQUENCE:".length), 10);
      if (Number.isSafeInteger(parsed) && parsed >= 0) mediaSequence = parsed;
      continue;
    }

    if (trimmed.startsWith("#EXT-X-KEY:")) {
      const attributes = parseAttributeList(trimmed.slice("#EXT-X-KEY:".length));
      const method = attributes.get("METHOD");

      if (method === "NONE") {
        currentKey = undefined;
        continue;
      }
      if (method !== "AES-128") {
        throw new Error(`Unsupported HLS encryption method: ${method ?? "unknown"}`);
      }

      currentKey = parseAes128KeyTag(trimmed.slice("#EXT-X-KEY:".length), baseUrl);
      continue;
    }

    if (trimmed.startsWith("#")) continue;

    const sequence = mediaSequence + segmentIndex;
    segments.push({
      url: new URL(trimmed, baseUrl).href,
      sequence,
      encryption: currentKey
        ? {
            method: "AES-128",
            keyUrl: currentKey.keyUrl,
            iv: currentKey.explicitIv
              ? new Uint8Array(currentKey.explicitIv)
              : sequenceToIv(sequence),
          }
        : undefined,
    });
    segmentIndex++;
  }

  return segments;
}

/**
 * Backwards-compatible URL-only parser used by existing callers.
 */
export function parseVariantPlaylist(text: string, baseUrl: string): string[] {
  return parseMediaPlaylist(text, baseUrl).map((segment) => segment.url);
}

function parseAes128KeyTag(attributeBody: string, baseUrl: string): HlsKeyRef {
  const attributes = parseAttributeList(attributeBody);
  const method = attributes.get("METHOD");
  if (method && method !== "AES-128") {
    throw new Error(`Unsupported HLS encryption method: ${method}`);
  }

  const uri = attributes.get("URI");
  if (!uri) throw new Error("AES-128 key URI is missing");

  return {
    keyUrl: new URL(uri, baseUrl).href,
    explicitIv: attributes.has("IV")
      ? parseIv(attributes.get("IV") ?? "")
      : undefined,
  };
}

function parseAttributeList(value: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const pattern = /(?:^|,)\s*([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;

  for (const match of value.matchAll(pattern)) {
    const raw = match[2];
    attributes.set(match[1], raw.startsWith('"') ? raw.slice(1, -1) : raw);
  }

  return attributes;
}

function parseIv(value: string): Uint8Array<ArrayBuffer> {
  const hex = value.replace(/^0x/i, "");
  if (!hex || hex.length > 32 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("Invalid AES-128 IV");
  }

  const padded = hex.padStart(32, "0");
  const iv = new Uint8Array(16);
  for (let i = 0; i < iv.length; i++) {
    iv[i] = Number.parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return iv;
}

function sequenceToIv(sequence: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(16);
  let value = BigInt(sequence);
  for (let i = iv.length - 1; i >= 0 && value > 0n; i--) {
    iv[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return iv;
}
