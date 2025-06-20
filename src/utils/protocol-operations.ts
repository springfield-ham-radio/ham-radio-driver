import type { ProtocolContext } from "../protocol-context.js";
import { CancelledException } from "../cancelled-exception.js";
import { ByteLengthParser } from "@serialport/parser-byte-length";
import { ReceivePatternValidatorFactory } from "./validator-factory.js";
import { resolveExpressions } from "./expression-utils.js";

/**
 * Protocol Operations: Template Method Pattern Implementation
 *
 * This module implements the Template Method pattern for radio protocol operations,
 * providing a structured approach to send-receive communication with radio devices.
 * It defines the common flow for protocol operations while allowing specialized
 * behavior through abstract methods.
 *
 * Purpose:
 * - Provides a consistent framework for protocol operations
 * - Handles common concerns like timeout, error handling, and cancellation
 * - Supports dynamic expression resolution for protocol data
 * - Implements reliable send-receive communication patterns
 * - Centralizes parser setup and data handling logic
 *
 * Design Rationale:
 * - Template Method pattern ensures consistent operation flow
 * - Abstract methods allow specialized behavior for different operation types
 * - Timeout handling prevents indefinite waiting for responses
 * - Cancellation support enables user-initiated operation termination
 * - Error handling provides clear feedback for communication failures
 *
 * Usage:
 * Protocol operations are used by executors to implement complex communication
 * patterns with radio devices, such as sending commands and receiving responses
 * with validation and data extraction.
 */

/**
 * Abstract base class for protocol operations using the Template Method pattern.
 *
 * This class defines the common structure for protocol operations while
 * allowing subclasses to implement specialized behavior for different
 * operation types.
 */
export abstract class ProtocolOperationTemplate {
  /**
   * Validates the operation configuration before execution.
   *
   * @param config - The operation configuration to validate
   * @throws Error if the configuration is invalid
   */
  protected abstract validateConfiguration(config: any): void;

  /**
   * Sets up the parser for receiving data from the radio device.
   *
   * @param config - The operation configuration
   * @param context - The protocol context
   * @returns The configured parser instance
   */
  protected abstract setupParser(config: any, context: ProtocolContext): any;

  /**
   * Handles received data and extracts the relevant information.
   *
   * @param data - The raw data received from the radio device
   * @param config - The operation configuration
   * @param context - The protocol context
   * @returns The extracted data as a Uint8Array
   */
  protected abstract handleData(data: Buffer, config: any, context: ProtocolContext): Uint8Array;

  /**
   * Handles errors that occur during the operation.
   *
   * @param error - The error that occurred
   * @param config - The operation configuration
   */
  protected abstract handleError(error: Error, config: any): void;

  /**
   * Sends data to the radio device.
   *
   * @param config - The operation configuration
   * @param context - The protocol context
   */
  protected abstract sendData(config: any, context: ProtocolContext): void;

  /**
   * Executes the protocol operation using the template method pattern.
   *
   * This method implements the common flow for protocol operations:
   * 1. Validate configuration
   * 2. Check for cancellation
   * 3. Set up parser and timeout
   * 4. Send data to device
   * 5. Wait for and handle response
   * 6. Clean up resources
   *
   * @param config - The operation configuration
   * @param context - The protocol context
   * @returns Promise that resolves to the extracted data
   * @throws CancelledException if the operation is cancelled
   * @throws Error if the operation fails or times out
   *
   * Example:
   * ```typescript
   * const operation = new SendReceiveOperation();
   * const result = await operation.execute({
   *   send: [0x01, 0x02, 0x03],
   *   receive: { type: 'exact', value: 0x06 },
   *   timeout: 5000,
   *   description: 'Send command and receive acknowledgment'
   * }, context);
   * ```
   */
  async execute(config: any, context: ProtocolContext): Promise<Uint8Array> {
    this.validateConfiguration(config);

    // Check for cancellation before starting the operation
    if (context.progressIndicator?.isCanceled) {
      throw new CancelledException('Protocol operation was cancelled');
    }

    return new Promise((resolve, reject) => {
      const parser = this.setupParser(config, context);

      const timeoutId = setTimeout(() => {
        parser.removeAllListeners();
        reject(new Error(`Timeout waiting for response: ${config.description || "operation"}`));
      }, config.timeout || 5000);

      parser.on("data", (data: Buffer) => {
        clearTimeout(timeoutId);
        parser.removeAllListeners();

        try {
          const result = this.handleData(data, config, context);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      parser.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        parser.removeAllListeners();
        this.handleError(error, config);
        reject(error);
      });

      this.sendData(config, context);
    });
  }
}

/**
 * Implementation of send-receive protocol operations.
 *
 * This class handles the common pattern of sending data to a radio device
 * and receiving a response with validation. It uses the template method
 * pattern to provide a consistent framework for this type of operation.
 */
export class SendReceiveOperation extends ProtocolOperationTemplate {
  /**
   * Validates that the configuration contains both send and receive specifications.
   *
   * @param config - The operation configuration
   * @throws Error if send or receive configuration is missing
   */
  protected validateConfiguration(config: any): void {
    if (!config.send || !config.receive) {
      throw new Error("SendReceive operation requires both send and receive configuration");
    }
  }

  /**
   * Sets up a byte-length parser based on the expected receive pattern.
   *
   * @param config - The operation configuration
   * @param context - The protocol context
   * @returns A ByteLengthParser configured for the expected data length
   */
  protected setupParser(config: any, context: ProtocolContext): any {
    const expectedLength = ReceivePatternValidatorFactory.getValidator(config.receive).getExpectedLength(config.receive, context);
    return context.port.pipe(new ByteLengthParser({ length: expectedLength }));
  }

  /**
   * Validates received data against the expected pattern and extracts relevant data.
   *
   * @param data - The raw data received from the radio device
   * @param config - The operation configuration
   * @param _context - The protocol context (unused in this implementation)
   * @returns The extracted data from the response
   * @throws Error if the received data doesn't match the expected pattern
   */
  protected handleData(data: Buffer, config: any, _context: ProtocolContext): Uint8Array {
    const validator = ReceivePatternValidatorFactory.getValidator(config.receive);

    if (validator.validate(data, config.receive)) {
      return validator.extractData(new Uint8Array(data), config.receive);
    } else {
      throw new Error(`Invalid response pattern: ${Buffer.from(data).toString("hex")}`);
    }
  }

  /**
   * Handles errors during the operation (delegated to template method).
   *
   * @param _error - The error that occurred (handled by template method)
   * @param _config - The operation configuration (unused)
   */
  protected handleError(_error: Error, _config: any): void {
    // Error handling is done in the template method
  }

  /**
   * Sends data to the radio device after resolving any expressions.
   *
   * @param config - The operation configuration
   * @param context - The protocol context
   */
  protected sendData(config: any, context: ProtocolContext): void {
    const sendData = resolveExpressions(config.send, context);
    context.port.write(sendData);
  }
}
