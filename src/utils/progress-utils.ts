import type { RadioMemoryConfig, RadioProtocolStep } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import { inclusiveSegmentSize } from "./token-utils.js";
import { isExchangeStep, isReadStep, isWriteStep } from "./step-guards.js";

/**
 * Count chunk round-trips for the named memory segments.
 * Each chunk is one unit of wall-clock work (send/receive, optional ack).
 */
export function countSegmentChunkUnits(segmentNames: string[], memoryConfig: RadioMemoryConfig): number {
  return segmentNames.reduce((total, segmentName) => {
    const segment = memoryConfig.segments[segmentName];
    if (!segment) {
      return total;
    }
    const size = inclusiveSegmentSize(segment.startAddress, segment.endAddress);
    return total + Math.ceil(size / memoryConfig.chunkSize);
  }, 0);
}

/**
 * Estimate total progress units for a protocol run.
 * Handshake exchanges count as one unit each; read/write steps count one unit per chunk.
 */
export function countProtocolProgressUnits(steps: RadioProtocolStep[], memoryConfig: RadioMemoryConfig): number {
  return steps.reduce((total, step) => {
    if (isReadStep(step)) {
      return total + countSegmentChunkUnits(step.read.segments, memoryConfig);
    }
    if (isWriteStep(step)) {
      return total + countSegmentChunkUnits(step.write.segments, memoryConfig);
    }
    if (isExchangeStep(step)) {
      return total + 1;
    }
    return total;
  }, 0);
}

export function advanceProgress(context: ProtocolContext, units = 1): void {
  if (!context.progressIndicator || units <= 0) {
    return;
  }

  const total = context.totalProgressUnits ?? 0;
  if (total <= 0) {
    return;
  }

  context.completedProgressUnits = (context.completedProgressUnits ?? 0) + units;
  context.progressIndicator.setValue(Math.min(context.completedProgressUnits / total, 1));
}
