import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import { executeSendReceive } from '../utils/step-utils.js';
import { StepExecutor } from './base.js';

/**
 * SendReceive Executor: Bidirectional Communication Implementation
 *
 * This executor is responsible for sending data to ham radio devices and
 * receiving responses using serial port communication. It implements the
 * StepExecutor interface to handle 'sendReceive' protocol steps.
 *
 * Purpose:
 * - Sends data to radio devices and waits for responses
 * - Handles bidirectional communication patterns common in radio protocols
 * - Provides reliable send-receive operations with proper timing
 * - Supports protocol-driven request-response patterns
 * - Enables complex radio device interactions requiring acknowledgment
 *
 * Design Rationale:
 * - Combines send and receive operations in a single atomic step
 * - Ensures proper timing between transmission and reception
 * - Handles common radio communication patterns (command-response)
 * - Provides unified error handling for bidirectional operations
 * - Simplifies protocol design for request-response scenarios
 *
 * Usage:
 * The executor is used by the protocol interpreter to handle 'sendReceive' steps
 * in radio communication protocols, typically for sending commands and
 * immediately waiting for responses or acknowledgments from radio devices.
 */
export class SendReceiveExecutor implements StepExecutor {
  /**
   * Determines if this executor can handle the given protocol step.
   *
   * @param step - The protocol step to check
   * @returns true if the step contains a 'sendReceive' property, false otherwise
   */
  canExecute(step: RadioProtocolStep): boolean {
    return 'sendReceive' in step;
  }

  /**
   * Executes a sendReceive step by transmitting data and receiving a response.
   *
   * This method handles the complete send-receive cycle by first sending
   * data to the radio device and then waiting for and processing the
   * response. It delegates the actual implementation to the step-utils
   * module for proper separation of concerns.
   *
   * @param step - The protocol step containing sendReceive configuration
   * @param context - The protocol context containing state and utilities
   * @throws Error if send-receive operation fails or communication error occurs
   *
   * Example:
   * ```typescript
   * const executor = new SendReceiveExecutor();
   * await executor.execute({
   *   sendReceive: {
   *     description: 'Reading channel data',
   *     send: [0x01, 0x02, 0x03],
   *     receive: { pattern: [0x04, 0x05, 0x06] }
   *   }
   * }, context);
   * ```
   */
  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const config = (step as any).sendReceive;
    await executeSendReceive(config, context);
  }
}
