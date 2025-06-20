import type { ProtocolContext } from '../protocol-context.js';
import type { RadioReceivePattern } from '@springfield/ham-radio-api';
import { SendReceiveOperation } from './protocol-operations.js';
import { ReceivePatternValidatorFactory } from './validator-factory.js';

/**
 * Step Utilities: Protocol Step Helper Functions
 *
 * This module provides utility functions for working with radio protocol steps,
 * particularly for validating receive patterns, extracting data from responses,
 * and executing send-receive operations. These utilities simplify common
 * protocol operations and provide consistent behavior across different executors.
 *
 * Purpose:
 * - Validates received data against expected patterns
 * - Extracts relevant data from radio device responses
 * - Executes send-receive operations with proper error handling
 * - Provides consistent interface for common protocol operations
 * - Simplifies protocol step implementation for executors
 *
 * Design Rationale:
 * - Utility functions reduce code duplication across executors
 * - Centralized validation logic ensures consistent behavior
 * - Integration with validator factory provides extensible validation
 * - Send-receive operation wrapper simplifies complex communication patterns
 * - Error handling provides clear feedback for protocol failures
 *
 * Usage:
 * These utilities are used by protocol executors to implement common
 * operations like validating responses, extracting data, and performing
 * send-receive communication with radio devices.
 */

/**
 * Validates received data against an expected receive pattern.
 *
 * This function uses the ReceivePatternValidatorFactory to find the appropriate
 * validator for the given pattern and validates the received data against it.
 *
 * @param data - The raw data received from the radio device
 * @param pattern - The expected receive pattern to validate against
 * @param context - The protocol context containing state and utilities
 * @returns true if the data matches the pattern, false otherwise
 *
 * Example:
 * ```typescript
 * const isValid = validateReceivePattern(
 *   Buffer.from([0x06]),
 *   { type: 'exact', value: 0x06 }
 * ); // Returns true
 * ```
 */
export const validateReceivePattern = (data: Buffer, pattern: RadioReceivePattern, context?: ProtocolContext): boolean => {
  const validator = ReceivePatternValidatorFactory.getValidator(pattern);
  // Pass context for pattern types
  if (pattern.type === 'pattern') {
    return (validator as any).validate(data, pattern, context);
  }
  return validator.validate(data, pattern);
};

/**
 * Extracts relevant data from a response based on the receive pattern.
 *
 * This function uses the appropriate validator to extract the meaningful
 * data from a response, removing headers or other protocol overhead.
 *
 * @param data - The complete response data as a Uint8Array
 * @param pattern - The receive pattern that defines how to extract data
 * @returns The extracted data as a Uint8Array
 *
 * Example:
 * ```typescript
 * const extracted = extractDataFromResponse(
 *   new Uint8Array([0x06, 0x01, 0x02, 0x03]),
 *   { type: 'pattern', pattern: [0x06, { field: 'data', size: 3 }] }
 * ); // Returns Uint8Array([0x01, 0x02, 0x03])
 * ```
 */
export const extractDataFromResponse = (data: Uint8Array, pattern: RadioReceivePattern): Uint8Array => {
  const validator = ReceivePatternValidatorFactory.getValidator(pattern);
  return validator.extractData(data, pattern);
};

/**
 * Executes a send-receive operation with proper logging and error handling.
 *
 * This function creates a SendReceiveOperation instance and executes it with
 * the provided configuration. It handles logging of operation descriptions
 * and provides a simplified interface for send-receive communication.
 *
 * @param config - The send-receive operation configuration
 * @param context - The protocol context containing state and utilities
 * @returns Promise that resolves to the extracted data from the response
 * @throws Error if the operation fails, times out, or receives invalid data
 *
 * Example:
 * ```typescript
 * const result = await executeSendReceive({
 *   send: [0x01, 0x02, 0x03],
 *   receive: { type: 'exact', value: 0x06 },
 *   timeout: 5000,
 *   description: 'Send command and receive acknowledgment'
 * }, context);
 * ```
 */
export const executeSendReceive = async (config: { send: (string | number)[]; receive: RadioReceivePattern; timeout?: number; description?: string }, context: ProtocolContext): Promise<Uint8Array> => {
  const operation = new SendReceiveOperation();

  if (config.description) {
    context.logger.debug(config.description);
  }

  return operation.execute(config, context);
};
