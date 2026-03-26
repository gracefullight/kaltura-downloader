import { beforeEach, describe, expect, it, vi } from "vitest";

// --- Mock mux.js ---

interface MockTransmuxer {
  on: ReturnType<typeof vi.fn>;
  push: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  _trigger: (event: string, data?: unknown) => void;
}

let instance: MockTransmuxer;

vi.mock("mux.js", () => {
  const Transmuxer = vi.fn(function (this: any) {
    const handlers: Record<string, (data?: unknown) => void> = {};
    this.on = vi.fn(
      (event: string, handler: (data?: unknown) => void) => {
        handlers[event] = handler;
      },
    );
    this.push = vi.fn();
    this.flush = vi.fn();
    this._trigger = (event: string, data?: unknown) => {
      handlers[event]?.(data);
    };
    instance = this;
  });

  return {
    default: {
      mp4: { Transmuxer },
    },
  };
});

import { transmuxTsToMp4 } from "./transmux.js";

describe("transmuxTsToMp4", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with initSegment + data concatenated", async () => {
    const tsData = new Uint8Array([0x47, 0x00, 0x01]);
    const promise = transmuxTsToMp4(tsData);

    instance._trigger("data", {
      initSegment: new Uint8Array([0xaa, 0xbb]),
      data: new Uint8Array([0x01, 0x02, 0x03]),
    });
    instance._trigger("done");

    const result = await promise;
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(5);
    expect(Array.from(result)).toEqual([0xaa, 0xbb, 0x01, 0x02, 0x03]);
  });

  it("handles multiple data chunks", async () => {
    const promise = transmuxTsToMp4(new Uint8Array([0x47]));

    const init = new Uint8Array([0xff]);
    instance._trigger("data", {
      initSegment: init,
      data: new Uint8Array([0x10]),
    });
    instance._trigger("data", {
      initSegment: init,
      data: new Uint8Array([0x20]),
    });
    instance._trigger("data", {
      initSegment: init,
      data: new Uint8Array([0x30]),
    });
    instance._trigger("done");

    const result = await promise;
    // 1 byte init + 3 x 1 byte data = 4 bytes
    expect(Array.from(result)).toEqual([0xff, 0x10, 0x20, 0x30]);
  });

  it("only uses the first initSegment", async () => {
    const promise = transmuxTsToMp4(new Uint8Array([0x47]));

    instance._trigger("data", {
      initSegment: new Uint8Array([0xaa]),
      data: new Uint8Array([0x01]),
    });
    instance._trigger("data", {
      initSegment: new Uint8Array([0xbb]), // different, should be ignored
      data: new Uint8Array([0x02]),
    });
    instance._trigger("done");

    const result = await promise;
    expect(result[0]).toBe(0xaa); // first initSegment kept
  });

  it("rejects when no output produced", async () => {
    const promise = transmuxTsToMp4(new Uint8Array([0x47]));
    instance._trigger("done");

    await expect(promise).rejects.toThrow("Transmuxing produced no output");
  });

  it("rejects on error event", async () => {
    const promise = transmuxTsToMp4(new Uint8Array([0x47]));
    instance._trigger("error", new Error("Invalid TS packet"));

    await expect(promise).rejects.toThrow("Invalid TS packet");
  });

  it("passes tsData to transmuxer.push and calls flush", async () => {
    const tsData = new Uint8Array([0x47, 0x00, 0x11, 0x00]);
    const promise = transmuxTsToMp4(tsData);

    expect(instance.push).toHaveBeenCalledWith(tsData);
    expect(instance.flush).toHaveBeenCalledOnce();

    // Resolve the promise
    instance._trigger("data", {
      initSegment: new Uint8Array([1]),
      data: new Uint8Array([2]),
    });
    instance._trigger("done");
    await promise;
  });

  it("creates Transmuxer with correct options", async () => {
    const muxjs = await import("mux.js");
    const Transmuxer = (muxjs as any).default.mp4.Transmuxer;

    const promise = transmuxTsToMp4(new Uint8Array([0x47]));

    expect(Transmuxer).toHaveBeenCalledWith({
      keepOriginalTimestamps: true,
      remux: true,
    });

    instance._trigger("data", {
      initSegment: new Uint8Array([1]),
      data: new Uint8Array([2]),
    });
    instance._trigger("done");
    await promise;
  });
});
