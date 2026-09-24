import { describe, expect, it } from "vitest";
import type { RadioMemoryConfig } from "@springfield/ham-radio-api";
import {
  bufferOffsetForRadioAddress,
  countWritableChunks,
  isChunkSkipped,
} from "../../../src/utils/write-chunks.js";

const uv5rMemoryConfig: RadioMemoryConfig = {
  addressEndianness: "big",
  addressSize: 2,
  chunkSize: 64,
  segments: {
    channels: { endAddress: 6143, startAddress: 0 },
    settings: { endAddress: 8191, startAddress: 7872 },
  },
};

describe("write-chunks", () => {
  it("skips chunks that overlap a skip range", () => {
    expect(isChunkSkipped(0x0cf0, 0x0cff, [{ endAddress: 0x0cff, startAddress: 0x0cf0 }])).toBe(true);
    expect(isChunkSkipped(0x0ce0, 0x0cef, [{ endAddress: 0x0cff, startAddress: 0x0cf0 }])).toBe(false);
  });

  it("maps packed and sparse buffers", () => {
    const packedSize = 6144 + 320;
    expect(bufferOffsetForRadioAddress(0x0e20, uv5rMemoryConfig, packedSize)).toBe(0x0e20);
    expect(bufferOffsetForRadioAddress(0x1ee0, uv5rMemoryConfig, packedSize)).toBe(6144 + 0x20);
    expect(bufferOffsetForRadioAddress(0x1ee0, uv5rMemoryConfig, 8192)).toBe(0x1ee0);
  });

  it("counts 16-byte UV-5R write chunks minus calibration holes", () => {
    const skip = [
      { endAddress: 0x0cff, startAddress: 0x0cf0 },
      { endAddress: 0x0dff, startAddress: 0x0df0 },
    ];
    const full16 = countWritableChunks(["channels", "settings"], uv5rMemoryConfig, { chunkSize: 16 });
    const withSkip = countWritableChunks(["channels", "settings"], uv5rMemoryConfig, { chunkSize: 16, skip });

    expect(full16).toBe(6144 / 16 + 320 / 16);
    expect(withSkip).toBe(full16 - 2);
  });
});
