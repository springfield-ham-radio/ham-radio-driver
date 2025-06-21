import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep, RadioMemorySegment } from '@springfield/ham-radio-api';
import { CancelledException } from '../cancelled-exception.js';
import { executeSendReceive, extractDataFromResponse } from '../utils/step-utils.js';
import { StepExecutor } from './base.js';

/**
 * Read Segment Executor: Memory Segment Reading Implementation
 *
 * This executor is responsible for reading memory segments from ham radio devices
 * by executing a series of chunked read operations. It implements the StepExecutor
 * interface to handle 'readSegment' protocol steps.
 *
 * Purpose:
 * - Reads complete memory segments from radio devices using chunked communication
 * - Manages the reading process across multiple memory segments specified in the step
 * - Handles progress tracking and cancellation during long-running read operations
 * - Validates context state and segment configurations before execution
 * - Accumulates read data into the context's memory buffer
 *
 * Design Rationale:
 * - Memory segments are often too large to read in a single operation, requiring
 *   chunked reading with start/end acknowledgments for each chunk
 * - The executor maintains state through the ProtocolContext, tracking current
 *   segment, buffer offset, and progress indicators
 * - Cancellation support allows users to interrupt long-running read operations
 * - Error handling ensures proper validation of context state and segment configurations
 * - The chunked approach provides reliability and progress visibility for large reads
 *
 * Usage:
 * The executor is used by the protocol interpreter to handle 'readSegment' steps
 * in radio communication protocols, typically for reading channel memories, settings,
 * or other large data structures from radio devices.
 */
export class ReadSegmentExecutor implements StepExecutor {
  /**
   * Determines if this executor can handle the given protocol step.
   *
   * @param step - The protocol step to check
   * @returns true if the step contains a 'readSegment' property, false otherwise
   */
  canExecute(step: RadioProtocolStep): boolean {
    return 'readSegment' in step;
  }

  /**
   * Executes a read segment step by reading multiple memory segments from the radio device.
   *
   * This method processes each segment in the specified order, reading data in chunks
   * and accumulating the results in the context's memory buffer. It handles progress
   * tracking and cancellation throughout the process.
   *
   * @param step - The protocol step containing readSegment configuration
   * @param context - The protocol context containing state and utilities
   * @throws Error if memory buffer is not initialized, bufferOffset is invalid,
   *         segment configuration is missing, or operation is canceled
   *
   * Example:
   * ```typescript
   * const executor = new ReadSegmentExecutor();
   * await executor.execute({
   *   readSegment: {
   *     description: 'Reading channel memories',
   *     segments: ['channels', 'settings'],
   *     startChunk: { send: 'READ_START', receive: { type: 'exact', value: 'OK' } },
   *     endChunk: { send: 'READ_END', receive: { type: 'exact', value: 'DONE' } }
   *   }
   * }, context);
   * ```
   */
  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const config = (step as any).readSegment;
    const { description, endChunk, segments: segmentNames, startChunk } = config;

    if (description) {
      context.logger.debug(description);
    }

    // Validate context state before processing any segments

    if (!context.memoryBuffer) {
      throw new Error('Memory buffer not initialized in context');
    }

    if (typeof context.bufferOffset !== 'number') {
      throw new Error(`Invalid bufferOffset: expected number, got ${typeof context.bufferOffset}`);
    }

    // Accumulate chunk logs from all segments
    const allChunkLogs: Array<{
      segmentName: string;
      address: number;
      startSent: number[];
      startReceived: number[];
      endSent: number[];
      endReceived: number[];
    }> = [];

    for (const segmentName of segmentNames) {
      // Check for cancellation before processing each segment
      if (context.progressIndicator?.isCanceled) {
        throw new CancelledException('Radio read was cancelled');
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

      const segmentData = await this.readSegmentData({ context, endChunk, segmentConfig, startChunk });

      // Get the chunk logs for this segment and add segment name
      const segmentChunkLogs = context.variables.get('lastReadSegmentChunks') || [];
      const segmentChunkLogsWithName = segmentChunkLogs.map((chunk: any) => ({
        ...chunk,
        segmentName,
      }));
      allChunkLogs.push(...segmentChunkLogsWithName);

      context.memoryBuffer.set(segmentData, context.bufferOffset);
      context.bufferOffset += segmentData.length;
    }

    // Store all chunk logs from all segments for UI logging
    context.variables.set('lastReadSegmentChunks', allChunkLogs);
  }

  /**
   * Reads a single memory segment by processing it in chunks.
   *
   * This private method handles the low-level chunked reading process for a single
   * memory segment. It sends start chunk commands, extracts data from responses,
   * and sends end chunk acknowledgments for each chunk in the segment.
   *
   * @param params - Object containing context, chunk commands, and segment configuration
   * @returns Promise resolving to the complete segment data as a Uint8Array
   * @throws Error if the operation is canceled during chunk processing
   *
   * The method processes the segment address range in chunks of the specified size,
   * updating the current address in the context for each chunk processed.
   */
  private async readSegmentData(params: { context: ProtocolContext; endChunk: any; segmentConfig: RadioMemorySegment; startChunk: any }): Promise<Uint8Array> {
    const { endAddress, startAddress } = params.segmentConfig;
    const chunkSize = params.context.memoryConfig.chunkSize;
    const totalSize = endAddress - startAddress + 1;
    const data = new Uint8Array(totalSize);
    let offset = 0;

    // Build an array of chunk log entries for UI logging
    const chunkLogs: Array<{
      address: number;
      startSent: number[];
      startReceived: number[];
      endSent: number[];
      endReceived: number[];
    }> = [];

    for (let address = startAddress; address <= endAddress; address += chunkSize) {
      if (params.context.progressIndicator?.isCanceled) {
        throw new CancelledException('Radio read was cancelled');
      }

      params.context.currentSegment!.currentAddress = address;

      // --- Start chunk ---
      await executeSendReceive(params.startChunk, params.context);
      const startSent = params.context.variables.get('lastSentData');
      const startReceived = params.context.variables.get('lastReceivedData');

      // Extract data from response
      const chunkData = extractDataFromResponse(startReceived, params.startChunk.receive);
      const remaining = endAddress - address + 1;
      const expectedChunkLength = Math.min(chunkSize, remaining);
      if (chunkData.length > expectedChunkLength) {
        throw new RangeError(
          `ReadSegmentExecutor: Chunk data too large. address=${address}, offset=${offset}, chunkData.length=${chunkData.length}, expectedChunkLength=${expectedChunkLength}, data.length=${data.length}, startAddress=${startAddress}, endAddress=${endAddress}, chunkSize=${chunkSize}`
        );
      }
      if (offset + chunkData.length > data.length) {
        throw new RangeError(
          `ReadSegmentExecutor: Attempt to write beyond buffer bounds. address=${address}, offset=${offset}, chunkData.length=${chunkData.length}, data.length=${data.length}, startAddress=${startAddress}, endAddress=${endAddress}, chunkSize=${chunkSize}`
        );
      }
      data.set(chunkData, offset);
      offset += chunkData.length;

      // --- End chunk ---
      await executeSendReceive(params.endChunk, params.context);
      const endSent = params.context.variables.get('lastSentData');
      const endReceived = params.context.variables.get('lastReceivedData');

      chunkLogs.push({
        address,
        startSent: Array.from(startSent || []),
        startReceived: Array.from(startReceived || []),
        endSent: Array.from(endSent || []),
        endReceived: Array.from(endReceived || []),
      });
    }

    // Store the chunk log array in context for UI logging
    params.context.variables.set('lastReadSegmentChunks', chunkLogs);

    return data;
  }
}
