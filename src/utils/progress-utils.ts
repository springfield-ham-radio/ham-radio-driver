import type { RadioMemoryConfig, RadioProtocolStep } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import { isCatReadStep, isCatWriteStep, isExchangeStep, isReadStep, isWriteStep } from "./step-guards.js";
import { countWritableChunks, writeLoopOptions } from "./write-chunks.js";
import { KENWOOD_TH_F6_SETTINGS_COMMAND_COUNT } from "./kenwood-th-f6-cat.js";

const kenwoodThF6SettingsProgressUnits = (memoryConfig: RadioMemoryConfig): number =>
  memoryConfig.segments.settings === undefined ? 0 : KENWOOD_TH_F6_SETTINGS_COMMAND_COUNT;

/**
 * Count chunk round-trips for the named memory segments.
 * Each chunk is one unit of wall-clock work (send/receive, optional ack).
 */
export function countSegmentChunkUnits(segmentNames: string[], memoryConfig: RadioMemoryConfig): number {
  return countWritableChunks(segmentNames, memoryConfig);
}

/**
 * Estimate total progress units for a protocol run.
 * Handshake exchanges count as one unit each; read/write steps count one unit per chunk.
 */
export function countProtocolProgressUnits(steps: RadioProtocolStep[], memoryConfig: RadioMemoryConfig): number {
  return steps.reduce((total, step) => {
    if (isReadStep(step)) {
      return total + countWritableChunks(step.read.segments, memoryConfig);
    }
    if (isWriteStep(step)) {
      return total + countWritableChunks(step.write.segments, memoryConfig, writeLoopOptions(step.write));
    }
    if (isCatReadStep(step)) {
      const settingsUnits = step.catRead.pack === "kenwood-th-f6" ? kenwoodThF6SettingsProgressUnits(memoryConfig) : 0;
      return total + step.catRead.count + settingsUnits;
    }
    if (isCatWriteStep(step)) {
      const settingsUnits = step.catWrite.pack === "kenwood-th-f6" ? kenwoodThF6SettingsProgressUnits(memoryConfig) : 0;
      return total + step.catWrite.count + settingsUnits;
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
