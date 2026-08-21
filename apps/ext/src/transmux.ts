/**
 * TS → MP4 transmuxer using mux.js.
 *
 * Takes raw MPEG-TS bytes and produces a playable MP4 (fragmented MP4).
 * No re-encoding — just container conversion, so it's fast.
 */

// @ts-expect-error mux.js has no type declarations
import muxjs from "mux.js";

interface TransmuxSegment {
  initSegment: Uint8Array;
  data: Uint8Array;
}

/** MPEG-TS packet size and sync byte (ISO/IEC 13818-1). */
const TS_PACKET_SIZE = 188;
const TS_SYNC_BYTE = 0x47;

/**
 * Returns true when `data` looks like MPEG-TS (sync byte 0x47 on packet boundaries).
 * Used to fail fast on ciphertext / wrong-format input before mux.js.
 */
export function isMpegTs(data: Uint8Array): boolean {
  if (data.byteLength === 0 || data[0] !== TS_SYNC_BYTE) return false;

  if (data.byteLength < TS_PACKET_SIZE) {
    // Short buffer still starting with sync is accepted (unit tests / partial).
    return true;
  }

  const packetsToCheck = Math.min(5, Math.floor(data.byteLength / TS_PACKET_SIZE));
  for (let i = 0; i < packetsToCheck; i++) {
    if (data[i * TS_PACKET_SIZE] !== TS_SYNC_BYTE) return false;
  }
  return true;
}

/**
 * Transmux MPEG-TS data to fragmented MP4.
 * Returns a single Uint8Array containing a valid MP4 file.
 */
export function transmuxTsToMp4(tsData: Uint8Array): Promise<Uint8Array> {
  if (!isMpegTs(tsData)) {
    const head = tsData.byteLength > 0 ? `0x${tsData[0]!.toString(16).padStart(2, "0")}` : "empty";
    // 0x23 === '#': almost always nested m3u8 text fetched as a "segment".
    const looksLikePlaylist =
      tsData.byteLength >= 7 &&
      String.fromCharCode(tsData[0]!, tsData[1]!, tsData[2]!, tsData[3]!, tsData[4]!, tsData[5]!, tsData[6]!) ===
        "#EXTM3U";

    return Promise.reject(
      new Error(
        looksLikePlaylist
          ? "Input looks like an HLS playlist (#EXTM3U), not MPEG-TS. " +
              "A master playlist URI was likely treated as a media segment."
          : `Input is not MPEG-TS (expected sync byte 0x47, got ${head}). ` +
              "Segments may still be encrypted or use an unsupported container.",
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const transmuxer = new muxjs.mp4.Transmuxer({
      keepOriginalTimestamps: true,
      remux: true,
    });

    const chunks: Uint8Array[] = [];
    let initSegment: Uint8Array | null = null;

    transmuxer.on("data", (segment: TransmuxSegment) => {
      if (!initSegment) {
        initSegment = segment.initSegment;
      }
      chunks.push(segment.data);
    });

    transmuxer.on("done", () => {
      if (!initSegment || chunks.length === 0) {
        reject(new Error("Transmuxing produced no output"));
        return;
      }

      // Concatenate: initSegment + all media chunks
      const totalSize =
        initSegment.byteLength +
        chunks.reduce((sum, c) => sum + c.byteLength, 0);

      const mp4 = new Uint8Array(totalSize);
      let offset = 0;

      mp4.set(initSegment, offset);
      offset += initSegment.byteLength;

      for (const chunk of chunks) {
        mp4.set(chunk, offset);
        offset += chunk.byteLength;
      }

      resolve(mp4);
    });

    transmuxer.on("error", (err: Error) => {
      reject(err);
    });

    // Push TS data and flush
    transmuxer.push(tsData);
    transmuxer.flush();
  });
}
