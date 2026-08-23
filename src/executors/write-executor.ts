import type { ProtocolContext } from "../protocol-context.js";
import type { RadioByteToken, RadioExpect, RadioMemorySegment, RadioProtocolStep } from "@springfield/ham-radio-api";
import { CancelledException } from "../cancelled-exception.js";
import { executeExchange } from "../utils/step-utils.js";
import { isWriteStep } from "../utils/step-guards.js";
import { advanceProgress } from "../utils/progress-utils.js";
import { bufferOffsetForRadioAddress, isChunkSkipped, wait, writeLoopOptions } from "../utils/write-chunks.js";
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
    const { chunkSize, delay, skip } = writeLoopOptions(step.write);

    if (step.description) {
      context.logger.debug(step.description);
    }

    if (!context.memoryBuffer) {
      throw new Error("No write data buffer provided in context");
    }

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

      await this.writeSegmentData({
        chunkSize: chunkSize ?? context.memoryConfig.chunkSize,
        context,
        delay: delay ?? 0,
        expect,
        segmentConfig,
        send,
        skip,
        timeout,
      });
    }
  }

  private async writeSegmentData(params: {
    chunkSize: number;
    context: ProtocolContext;
    delay: number;
    expect: RadioExpect;
    segmentConfig: RadioMemorySegment;
    send: RadioByteToken[];
    skip?: RadioMemorySegment[];
    timeout?: number;
  }): Promise<void> {
    const { endAddress, startAddress } = params.segmentConfig;
    const buffer = params.context.memoryBuffer;

    for (let address = startAddress; address <= endAddress; address += params.chunkSize) {
      if (params.context.progressIndicator?.isCanceled) {
        throw new CancelledException("Radio write was cancelled");
      }

      const remaining = endAddress - address + 1;
      const thisChunk = Math.min(params.chunkSize, remaining);
      const chunkEnd = address + thisChunk - 1;

      if (isChunkSkipped(address, chunkEnd, params.skip)) {
        continue;
      }

      params.context.currentSegment!.currentAddress = address;
      params.context.variables.set("chunkLength", thisChunk);

      const offset = bufferOffsetForRadioAddress(address, params.context.memoryConfig, buffer.length);
      const chunkData = buffer.slice(offset, offset + thisChunk);

      if (chunkData.length !== thisChunk) {
        throw new RangeError(
          `WriteExecutor: buffer too short for address 0x${address.toString(16)}. need=${thisChunk}, have=${chunkData.length}, offset=${offset}, buffer=${buffer.length}`,
        );
      }

      params.context.variables.set("segment.data", chunkData);

      await executeExchange({ expect: params.expect, send: params.send, timeout: params.timeout }, params.context);
      await wait(params.delay);
      advanceProgress(params.context);
    }
  }
}
