import { ByteLengthParser } from '@serialport/parser-byte-length';
import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import { StepExecutor } from './base.js';

/**
 * Receive Executor: Data Reception Implementation
 *
 * This executor is responsible for receiving data from ham radio devices
 * using byte-length parsing. It implements the StepExecutor interface to
 * handle 'receive' protocol steps.
 *
 * Purpose:
 * - Receives data from radio devices with specified byte length
 * - Uses ByteLengthParser to ensure complete data reception
 * - Stores received data in context variables for use by other steps
 * - Provides reliable data reception with error handling
 * - Supports optional descriptive logging for debugging
 *
 * Design Rationale:
 * - Byte-length parsing ensures complete data reception before processing
 * - Promise-based execution allows for proper async/await integration
 * - Event listener cleanup prevents memory leaks and ensures single-use behavior
 * - Error handling provides clear feedback for communication failures
 * - Variable storage enables data sharing between protocol steps
 *
 * Usage:
 * The executor is used by the protocol interpreter to handle 'receive' steps
 * in radio communication protocols, typically for receiving responses,
 * acknowledgments, or data payloads from radio devices.
 */
export class ReceiveExecutor implements StepExecutor {
  /**
   * Determines if this executor can handle the given protocol step.
   *
   * @param step - The protocol step to check
   * @returns true if the step contains a 'receive' property, false otherwise
   */
  canExecute(step: RadioProtocolStep): boolean {
    return 'receive' in step;
  }

  /**
   * Executes a receive step by waiting for data from the radio device.
   *
   * This method sets up a byte-length parser to receive the specified amount
   * of data from the radio device. It handles the reception process with
   * proper error handling and stores the received data in the context for
   * potential use by subsequent protocol steps.
   *
   * @param step - The protocol step containing receive configuration
   * @param context - The protocol context containing state and utilities
   * @throws Error if data reception fails or communication error occurs
   *
   * Example:
   * ```typescript
   * const executor = new ReceiveExecutor();
   * await executor.execute({
   *   receive: {
   *     description: 'Receiving channel data',
   *     length: 64
   *   }
   * }, context);
   * ```
   */
  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const config = (step as any).receive;
    const { description, length } = config;

    if (description) {
      context.logger.debug(description);
    }

    return new Promise((resolve, reject) => {
      const parser = context.port.pipe(new ByteLengthParser({ length }));

      parser.on('data', (data: Buffer) => {
        parser.removeAllListeners();
        const receivedData = new Uint8Array(data);

        // Store the received data in context variables for use by other steps and UI logging
        context.variables.set('lastReceivedData', receivedData);
        context.variables.set('lastReceivedDataBuffer', data);

        resolve();
      });

      parser.on('error', (error: Error) => {
        parser.removeAllListeners();
        reject(error);
      });
    });
  }
}
