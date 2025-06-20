import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import { resolveExpressions } from '../utils/expression-utils.js';
import { StepExecutor } from './base.js';

/**
 * Send Executor: Data Transmission Implementation
 *
 * This executor is responsible for sending data to ham radio devices
 * using serial port communication. It implements the StepExecutor interface to
 * handle 'send' protocol steps.
 *
 * Purpose:
 * - Sends data to radio devices through serial port communication
 * - Resolves expressions in data payloads for dynamic content
 * - Provides reliable data transmission with error handling
 * - Supports optional descriptive logging for debugging
 * - Enables protocol-driven radio device control and configuration
 *
 * Design Rationale:
 * - Direct port writing ensures immediate data transmission
 * - Expression resolution allows for dynamic data content based on context
 * - Promise-based execution allows for proper async/await integration
 * - Error handling provides clear feedback for communication failures
 * - Descriptive logging enables protocol debugging and monitoring
 *
 * Usage:
 * The executor is used by the protocol interpreter to handle 'send' steps
 * in radio communication protocols, typically for sending commands,
 * configuration data, or control signals to radio devices.
 */
export class SendExecutor implements StepExecutor {
  /**
   * Determines if this executor can handle the given protocol step.
   *
   * @param step - The protocol step to check
   * @returns true if the step contains a 'send' property, false otherwise
   */
  canExecute(step: RadioProtocolStep): boolean {
    return 'send' in step;
  }

  /**
   * Executes a send step by transmitting data to the radio device.
   *
   * This method resolves any expressions in the data payload and writes
   * the resulting data to the serial port for transmission to the radio
   * device. It handles the transmission process with proper error handling
   * and optional descriptive logging.
   *
   * @param step - The protocol step containing send configuration
   * @param context - The protocol context containing state and utilities
   * @throws Error if data transmission fails or communication error occurs
   *
   * Example:
   * ```typescript
   * const executor = new SendExecutor();
   * await executor.execute({
   *   send: {
   *     description: 'Sending channel read command',
   *     data: [0x01, 0x02, 0x03]
   *   }
   * }, context);
   * ```
   */
  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const config = (step as any).send;
    const { data, description } = config;

    if (description) {
      context.logger.debug(description);
    }

    const sendData = resolveExpressions(data, context);
    context.port.write(sendData);
  }
}
