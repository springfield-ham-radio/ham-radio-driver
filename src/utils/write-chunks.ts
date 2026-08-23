import type { RadioMemoryConfig, RadioMemorySegment, RadioWriteStep } from "@springfield/ham-radio-api";
import { inclusiveSegmentSize } from "./token-utils.js";

export interface WriteChunkOptions {
  chunkSize?: number;
  delay?: number;
  skip?: RadioMemorySegment[];
}

export const writeLoopOptions = (write: RadioWriteStep["write"]): WriteChunkOptions => write as WriteChunkOptions;

export const addressRangeOverlaps = (startA: number, endA: number, startB: number, endB: number): boolean => startA <= endB && startB <= endA;

export const isChunkSkipped = (address: number, chunkEnd: number, skip: RadioMemorySegment[] | undefined): boolean => {
  if (!skip?.length) {
    return false;
  }

  return skip.some((range) => addressRangeOverlaps(address, chunkEnd, range.startAddress, range.endAddress));
};

/**
 * Map a radio EEPROM address to an offset in the memory buffer.
 *
 * Packed buffers (driver read) concatenate segments in config order.
 * Sparse buffers that cover the highest segment end address use absolute offsets.
 */
export const bufferOffsetForRadioAddress = (radioAddress: number, memoryConfig: RadioMemoryConfig, bufferLength: number): number => {
  const segments = Object.values(memoryConfig.segments);
  const maxEndAddress = Math.max(...segments.map((segment) => segment.endAddress));

  if (bufferLength >= maxEndAddress + 1) {
    return radioAddress;
  }

  let offset = 0;

  for (const segment of segments) {
    if (radioAddress >= segment.startAddress && radioAddress <= segment.endAddress) {
      return offset + (radioAddress - segment.startAddress);
    }

    offset += inclusiveSegmentSize(segment.startAddress, segment.endAddress);
  }

  throw new Error(`Radio address 0x${radioAddress.toString(16)} is not in any memory segment`);
};

export const countWritableChunks = (segmentNames: string[], memoryConfig: RadioMemoryConfig, options: WriteChunkOptions = {}): number => {
  const chunkSize = options.chunkSize ?? memoryConfig.chunkSize;

  return segmentNames.reduce((total, segmentName) => {
    const segment = memoryConfig.segments[segmentName];
    if (!segment) {
      return total;
    }

    let count = 0;

    for (let address = segment.startAddress; address <= segment.endAddress; address += chunkSize) {
      const chunkEnd = Math.min(address + chunkSize - 1, segment.endAddress);
      if (!isChunkSkipped(address, chunkEnd, options.skip)) {
        count += 1;
      }
    }

    return total + count;
  }, 0);
};

export const wait = async (milliseconds: number): Promise<void> => {
  if (milliseconds <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};
