import type { ProtocolContext } from "../protocol-context.js";
import type { RadioByteToken, RadioExpect, RadioMemorySegment, RadioProtocolStep } from "@springfield/ham-radio-api";
import { CancelledException } from "../cancelled-exception.js";
import { executeExchange } from "../utils/step-utils.js";
import { inclusiveSegmentSize } from "../utils/token-utils.js";
import { isWriteStep } from "../utils/step-guards.js";
import { StepExecutor } from "./base.js";

export class WriteExecutor implements StepExecutor {
  canExecute(step: RadioProtocolStep): boolean {
    return isWriteStep(step);
  }

  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    if (!isWriteStep(step)) {
      throw new Error("WriteExecutor received a non-write step");
    }

    const { expect, segments: segmentNames, send, timeout } = step.write;

    if (step.description) {
      context.logger.debug(step.description);
    }

    if (!context.memoryBuffer) {
      throw new Error("No write data buffer provided in context");
    }

    let bufferOffset = context.bufferOffset ?? 0;

    for (const segmentName of segmentNames) {
      if (context.progressIndicator?.isCanceled) {
        throw new CancelledException("Radio write was cancelled");
      }

      const segmentConfig = context.memoryConfig.segments[segmentName];
      if (!segmentConfig) {
        throw new Error(`Segment '${segmentName}' not found in memory config`);
      }

      context.currentSegment = {
        config: segmentConfig,
        currentAddress: segmentConfig.startAddress,
        name: segmentName,
      };

      const segmentLength = inclusiveSegmentSize(segmentConfig.startAddress, segmentConfig.endAddress);
      const segmentData = context.memoryBuffer.slice(bufferOffset, bufferOffset + segmentLength);
      await this.writeSegmentData({ context, expect, segmentConfig, send, timeout, writeData: segmentData });
      bufferOffset += segmentLength;
    }

    context.bufferOffset = bufferOffset;
  }

  private async writeSegmentData(params: {
    context: ProtocolContext;
    expect: RadioExpect;
    segmentConfig: RadioMemorySegment;
    send: RadioByteToken[];
    timeout?: number;
    writeData: Uint8Array;
  }): Promise<void> {
    const { endAddress, startAddress } = params.segmentConfig;
    const chunkSize = params.context.memoryConfig.chunkSize;
    let dataOffset = 0;

    for (let address = startAddress; address <= endAddress; address += chunkSize) {
      if (params.context.progressIndicator?.isCanceled) {
        throw new CancelledException("Radio write was cancelled");
      }

      const remaining = endAddress - address + 1;
      const thisChunk = Math.min(chunkSize, remaining);
      params.context.currentSegment!.currentAddress = address;

      const chunkData = params.writeData.slice(dataOffset, dataOffset + thisChunk);
      params.context.variables.set("segment.data", chunkData);
      params.context.variables.set("chunkLength", thisChunk);

      await executeExchange({ expect: params.expect, send: params.send, timeout: params.timeout }, params.context);

      dataOffset += thisChunk;
    }
  }
}
