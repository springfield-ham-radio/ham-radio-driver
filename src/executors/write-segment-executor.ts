import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep, RadioMemorySegment } from '@springfield/ham-radio-api';
import { CancelledException } from '../cancelled-exception.js';
import { executeSendReceive } from '../utils/step-utils.js';
import { StepExecutor } from './base.js';

// Write segment executor
export class WriteSegmentExecutor implements StepExecutor {
  canExecute(step: RadioProtocolStep): boolean {
    return 'writeSegment' in step;
  }

  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const config = (step as any).writeSegment;
    const { description, receive, segments: segmentNames, send } = config;

    if (description) {
      context.logger.debug(description);
    }

    if (!context.memoryBuffer) {
      throw new Error('No write data buffer provided in context');
    }
    let bufferOffset = context.bufferOffset ?? 0;

    for (const segmentName of segmentNames) {
      // Check for cancellation before processing each segment
      if (context.progressIndicator?.isCanceled) {
        throw new CancelledException('Radio write was cancelled');
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

      // Calculate the segment data to write
      const segmentLength = segmentConfig.endAddress - segmentConfig.startAddress;
      const segmentData = context.memoryBuffer.slice(bufferOffset, bufferOffset + segmentLength);
      context.variables.set('segment.data', segmentData);
      await this.writeSegmentData({ context, receive, segmentConfig, send, writeData: segmentData });
      bufferOffset += segmentLength;
    }
    context.bufferOffset = bufferOffset;
  }

  private async writeSegmentData(params: { context: ProtocolContext; receive: any; segmentConfig: RadioMemorySegment; send: any; writeData: Uint8Array }): Promise<void> {
    const { endAddress, startAddress } = params.segmentConfig;
    const chunkSize = params.context.memoryConfig.chunkSize;
    let dataOffset = 0;

    for (let address = startAddress; address < endAddress; address += chunkSize) {
      // Check for cancellation before processing each chunk
      if (params.context.progressIndicator?.isCanceled) {
        throw new CancelledException('Radio write was cancelled');
      }

      params.context.currentSegment!.currentAddress = address;

      // Set segment data for this chunk
      const chunkData = params.writeData.slice(dataOffset, dataOffset + chunkSize);
      params.context.variables.set('segment.data', chunkData);

      // Send write command
      await executeSendReceive({ receive: params.receive, send: params.send }, params.context);

      dataOffset += chunkSize;
    }
  }
}
