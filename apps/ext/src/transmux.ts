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

/**
 * Transmux MPEG-TS data to fragmented MP4.
 * Returns a single Uint8Array containing a valid MP4 file.
 */
export function transmuxTsToMp4(tsData: Uint8Array): Promise<Uint8Array> {
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
