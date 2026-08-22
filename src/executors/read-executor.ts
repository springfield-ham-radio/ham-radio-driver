import type { ProtocolContext } from "../protocol-context.js";
import type { RadioByteToken, RadioExpect, RadioExchange, RadioMemorySegment, RadioProtocolStep } from "@springfield/ham-radio-api";
import { CancelledException } from "../cancelled-exception.js";
import { executeExchange, extractDataFromResponse } from "../utils/step-utils.js";
import { inclusiveSegmentSize } from "../utils/token-utils.js";
import { isReadStep } from "../utils/step-guards.js";
import { StepExecutor } from "./base.js";

export class ReadExecutor implements StepExecutor {
  canExecute(step: RadioProtocolStep): boolean {
    return isReadStep(step);
  }

  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    if (!isReadStep(step)) {
      throw new Error("ReadExecutor received a non-read step");
    }

    const { ack, expect, segments: segmentNames, send, timeout } = step.read;

    if (step.description) {
      context.logger.debug(step.description);
    }

    if (!context.memoryBuffer) {
      throw new Error("Memory buffer not initialized in context");
    }

    if (typeof context.bufferOffset !== "number") {
      throw new Error(`Invalid bufferOffset: expected number, got ${typeof context.bufferOffset}`);
    }

    const allChunkLogs: Array<{
      segmentName: string;
      address: number;
      startSent: number[];
      startReceived: number[];
      endSent: number[];
      endReceived: number[];
    }> = [];

    const totalChunks = segmentNames.reduce((total: number, segmentName: string) => {
      const segmentConfig = context.memoryConfig.segments[segmentName];
      if (segmentConfig) {
        const segmentSize = inclusiveSegmentSize(segmentConfig.startAddress, segmentConfig.endAddress);
        return total + Math.ceil(segmentSize / context.memoryConfig.chunkSize);
      }
      return total;
    }, 0);

    let processedChunks = 0;

    for (const segmentName of segmentNames) {
      if (context.progressIndicator?.isCanceled) {
        throw new CancelledException("Radio read was cancelled");
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

      const segmentData = await this.readSegmentData({
        ack,
        context,
        expect,
        processedChunks,
        segmentConfig,
        send,
        timeout,
        totalChunks,
      });

      const segmentSize = inclusiveSegmentSize(segmentConfig.startAddress, segmentConfig.endAddress);
      processedChunks += Math.ceil(segmentSize / context.memoryConfig.chunkSize);

      const segmentChunkLogs = context.variables.get("lastReadSegmentChunks") || [];
      allChunkLogs.push(...segmentChunkLogs.map((chunk: { address: number }) => ({ ...chunk, segmentName })));

      context.memoryBuffer.set(segmentData, context.bufferOffset);
      context.bufferOffset += segmentData.length;
    }

    context.variables.set("lastReadSegmentChunks", allChunkLogs);
  }

  private updateProgress(context: ProtocolContext, processedChunks: number, totalChunks: number, address: number, startAddress: number): void {
    if (!context.progressIndicator || totalChunks <= 0) {
      return;
    }

    const currentChunkInSegment = Math.floor((address - startAddress) / context.memoryConfig.chunkSize);
    const chunkProgress = (processedChunks + currentChunkInSegment) / totalChunks;
    const totalSteps = context.totalSteps ?? 1;
    const stepIndex = context.stepIndex ?? 0;
    const start = stepIndex / totalSteps;
    const end = (stepIndex + 1) / totalSteps;
    context.progressIndicator.setValue(Math.min(start + (end - start) * chunkProgress, 1));
  }

  private async readSegmentData(params: {
    ack?: RadioExchange;
    context: ProtocolContext;
    expect: RadioExpect;
    processedChunks: number;
    segmentConfig: RadioMemorySegment;
    send: RadioByteToken[];
    timeout?: number;
    totalChunks: number;
  }): Promise<Uint8Array> {
    const { endAddress, startAddress } = params.segmentConfig;
    const chunkSize = params.context.memoryConfig.chunkSize;
    const totalSize = inclusiveSegmentSize(startAddress, endAddress);
    const data = new Uint8Array(totalSize);
    let offset = 0;

    const chunkLogs: Array<{
      address: number;
      startSent: number[];
      startReceived: number[];
      endSent: number[];
      endReceived: number[];
    }> = [];

    for (let address = startAddress; address <= endAddress; ) {
      if (params.context.progressIndicator?.isCanceled) {
        throw new CancelledException("Radio read was cancelled");
      }

      this.updateProgress(params.context, params.processedChunks, params.totalChunks, address, startAddress);

      const remaining = endAddress - address + 1;
      const thisChunk = Math.min(chunkSize, remaining);
      params.context.currentSegment!.currentAddress = address;
      params.context.variables.set("chunkLength", thisChunk);

      await executeExchange({ expect: params.expect, send: params.send, timeout: params.timeout }, params.context);
      const startSent = params.context.variables.get("lastSentData");
      const startReceived = params.context.variables.get("lastReceivedData");
      const chunkData = extractDataFromResponse(startReceived, params.expect, params.context);

      if (offset + chunkData.length > data.length) {
        throw new RangeError(
          `ReadExecutor: Attempt to write beyond buffer bounds. address=${address}, offset=${offset}, chunkData.length=${chunkData.length}, data.length=${data.length}`,
        );
      }
      data.set(chunkData, offset);
      offset += chunkData.length;

      let endSent: number[] | undefined;
      let endReceived: number[] | undefined;
      if (params.ack) {
        await executeExchange(params.ack, params.context);
        endSent = params.context.variables.get("lastSentData");
        endReceived = params.context.variables.get("lastReceivedData");
      }

      chunkLogs.push({
        address,
        endReceived: Array.from(endReceived || []),
        endSent: Array.from(endSent || []),
        startReceived: Array.from(startReceived || []),
        startSent: Array.from(startSent || []),
      });

      address += chunkData.length;
    }

    params.context.variables.set("lastReadSegmentChunks", chunkLogs);
    return data;
  }
}
