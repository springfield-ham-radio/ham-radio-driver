import type { ProtocolContext } from "../protocol-context.js";
import type { RadioReceivePattern } from '@springfield/ham-radio-api';
import { ExpressionResolverFactory } from "./expression-resolvers.js";

/**
 * Receive Pattern Validators: Strategy Pattern Implementation
 *
 * This module implements the Strategy pattern for validating different types
 * of receive patterns in radio protocol communication. It provides specialized
 * validators for exact matches, variable lengths, pattern-based responses,
 * and wildcard patterns.
 *
 * Purpose:
 * - Validates received data against expected patterns
 * - Extracts relevant data from protocol responses
 * - Calculates expected data lengths for parser setup
 * - Supports multiple pattern types through strategy pattern
 * - Provides extensible validation framework
 *
 * Design Rationale:
 * - Strategy pattern allows different validation approaches for different pattern types
 * - Each validator specializes in a specific pattern format
 * - Common interface ensures consistent behavior across validators
 * - Length calculation enables proper parser configuration
 * - Data extraction separates protocol overhead from meaningful data
 *
 * Usage:
 * Validators are used by protocol operations and executors to validate
 * incoming radio responses and extract the relevant data for further processing.
 */

/**
 * Interface for receive pattern validators that implement the Strategy pattern.
 *
 * Each validator implements this interface to provide specialized validation
 * logic for different types of receive patterns encountered in radio protocols.
 */
export interface ReceivePatternValidator {
  /**
   * Determines if this validator can handle the given pattern type.
   *
   * @param pattern - The receive pattern to check
   * @returns true if this validator can handle the pattern, false otherwise
   */
  canValidate(pattern: RadioReceivePattern): boolean;

  /**
   * Validates received data against the expected pattern.
   *
   * @param data - The raw data received from the radio device
   * @param pattern - The expected receive pattern
   * @returns true if the data matches the pattern, false otherwise
   */
  validate(data: Buffer, pattern: RadioReceivePattern): boolean;

  /**
   * Extracts relevant data from a response based on the pattern.
   *
   * @param data - The complete response data
   * @param pattern - The receive pattern that defines extraction rules
   * @returns The extracted data as a Uint8Array
   */
  extractData(data: Uint8Array, pattern: RadioReceivePattern): Uint8Array;

  /**
   * Calculates the expected length of data for this pattern.
   *
   * @param pattern - The receive pattern
   * @param context - Optional protocol context for dynamic length calculation
   * @returns The expected data length in bytes
   */
  getExpectedLength(pattern: RadioReceivePattern, context?: ProtocolContext): number;
}

/**
 * Validates exact value matches in receive patterns.
 *
 * This validator handles patterns that expect a specific byte value
 * at the beginning of the response, typically used for acknowledgments
 * or status indicators.
 *
 * Example: { type: 'exact', value: 0x06 } expects the first byte to be 0x06
 */
export class ExactReceivePatternValidator implements ReceivePatternValidator {
  /**
   * Checks if the pattern is an exact value match.
   *
   * @param pattern - The receive pattern to check
   * @returns true if the pattern type is 'exact'
   */
  canValidate(pattern: RadioReceivePattern): boolean {
    return pattern.type === "exact";
  }

  /**
   * Validates that the first byte matches the expected value.
   *
   * @param data - The received data
   * @param pattern - The exact value pattern
   * @returns true if the first byte matches the expected value
   */
  validate(data: Buffer, pattern: RadioReceivePattern): boolean {
    if (pattern.type !== "exact") return false;
    return data[0] === pattern.value;
  }

  /**
   * Returns the complete data for exact matches.
   *
   * @param data - The received data
   * @param _pattern - The pattern (unused for exact matches)
   * @returns The complete data as-is
   */
  extractData(data: Uint8Array, _pattern: RadioReceivePattern): Uint8Array {
    return data;
  }

  /**
   * Returns 1 for exact value patterns.
   *
   * @param _pattern - The pattern (unused)
   * @returns 1 (exact patterns expect exactly one byte)
   */
  getExpectedLength(_pattern: RadioReceivePattern): number {
    return 1;
  }
}

/**
 * Validates variable-length responses with specified lengths.
 *
 * This validator handles patterns that expect a specific number of bytes
 * but don't care about the content, typically used for data blocks
 * of known size.
 *
 * Example: { type: 'variable', length: 64 } expects exactly 64 bytes
 */
export class VariableReceivePatternValidator implements ReceivePatternValidator {
  /**
   * Checks if the pattern is a variable-length pattern.
   *
   * @param pattern - The receive pattern to check
   * @returns true if the pattern type is 'variable'
   */
  canValidate(pattern: RadioReceivePattern): boolean {
    return pattern.type === "variable";
  }

  /**
   * Validates that the data length matches the expected length.
   *
   * @param data - The received data
   * @param pattern - The variable length pattern
   * @returns true if the data length matches the expected length
   */
  validate(data: Buffer, pattern: RadioReceivePattern): boolean {
    if (pattern.type !== "variable") return false;
    return data.length === pattern.length;
  }

  /**
   * Returns the complete data for variable-length patterns.
   *
   * @param data - The received data
   * @param _pattern - The pattern (unused for variable patterns)
   * @returns The complete data as-is
   */
  extractData(data: Uint8Array, _pattern: RadioReceivePattern): Uint8Array {
    return data;
  }

  /**
   * Returns the specified length for variable patterns.
   *
   * @param _pattern - The variable length pattern
   * @returns The expected length from the pattern
   */
  getExpectedLength(_pattern: RadioReceivePattern): number {
    if (_pattern.type !== "variable") return 1;
    return _pattern.length;
  }
}

/**
 * Validates complex pattern-based responses with headers and data.
 *
 * This validator handles patterns that consist of a fixed header followed
 * by variable data, typically used for structured protocol responses.
 * It supports both fixed and dynamic data lengths.
 *
 * Example: { type: 'pattern', pattern: [0x06, { field: 'data', size: 3 }] }
 */
export class PatternReceivePatternValidator implements ReceivePatternValidator {
  /**
   * Checks if the pattern is a complex pattern-based response.
   *
   * @param pattern - The receive pattern to check
   * @returns true if the pattern type is 'pattern'
   */
  canValidate(pattern: RadioReceivePattern): boolean {
    return pattern.type === "pattern";
  }

  /**
   * Validates that the data is at least as long as the pattern header.
   *
   * @param data - The received data
   * @param pattern - The pattern-based response pattern
   * @returns true if the data length is sufficient for the pattern
   */
  validate(data: Buffer, pattern: RadioReceivePattern, context?: ProtocolContext): boolean {
    if (pattern.type !== "pattern") return false;
    const expectedLength = this.getExpectedLength(pattern, context, data);
    return data.length >= expectedLength;
  }

  /**
   * Extracts data after the pattern header.
   *
   * @param data - The received data
   * @param _pattern - The pattern-based response pattern
   * @returns The data portion after the header
   */
  extractData(data: Uint8Array, _pattern: RadioReceivePattern): Uint8Array {
    if (_pattern.type !== "pattern") return data;
    const offset = this.calculatePatternHeaderLength(_pattern);
    return data.slice(offset);
  }

  /**
   * Calculates the expected total length including header and data.
   *
   * @param pattern - The pattern-based response pattern
   * @param context - Optional protocol context for dynamic length calculation
   * @param receivedData - Optional received data to extract length from
   * @returns The expected total length in bytes
   */
  getExpectedLength(pattern: RadioReceivePattern, context?: ProtocolContext, receivedData?: Buffer): number {
    if (pattern.type !== "pattern") return 1;
    const headerLength = this.calculatePatternHeaderLength(pattern);

    // If we have received data, try to extract the length field from it
    if (receivedData) {
      const dataLength = this.extractLengthFromResponse(receivedData, pattern);
      if (dataLength !== null) {
        return headerLength + dataLength;
      }
      // If we have received data but can't extract length, return header length only
      // This will cause validation to fail if the data is shorter than expected
      return headerLength;
    }

    if (context?.currentSegment) {
      return headerLength + context.memoryConfig.chunkSize;
    }

    if (pattern.dataLength && typeof pattern.dataLength === "string" && context) {
      const dataLength = resolveExpression(pattern.dataLength, context);
      if (typeof dataLength === "number") {
        return headerLength + dataLength;
      }
    }

    return headerLength;
  }

  /**
   * Extracts the data length from the received response.
   *
   * @param data - The received data
   * @param pattern - The pattern-based response pattern
   * @returns The data length or null if not found
   */
  private extractLengthFromResponse(data: Buffer, pattern: RadioReceivePattern): number | null {
    if (pattern.type !== "pattern" || !pattern.pattern) return null;

    let offset = 0;
    for (const field of pattern.pattern) {
      if (typeof field === "object" && field.field === "length") {
        // Check if we have enough data to read the length field
        if (offset + field.size > data.length) {
          return null; // Not enough data to read length field
        }
        // Extract the length field value (little-endian)
        let length = 0;
        for (let i = 0; i < field.size; i++) {
          length |= (data[offset + i] << (i * 8));
        }
        return length;
      }
      if (typeof field === "number" || typeof field === "string") {
        offset += 1;
      } else if (typeof field === "object") {
        offset += field.size;
      }
    }
    return null;
  }

  /**
   * Calculates the length of the pattern header.
   *
   * @param pattern - The pattern-based response pattern
   * @returns The header length in bytes
   */
  private calculatePatternHeaderLength(pattern: RadioReceivePattern): number {
    if (pattern.type !== "pattern") return 0;
    let headerLength = 0;
    for (const item of pattern.pattern) {
      if (typeof item === "string" || typeof item === "number") {
        headerLength += 1;
      } else if (typeof item === "object" && "field" in item) {
        headerLength += item.size;
      }
    }
    return headerLength;
  }
}

/**
 * Validates wildcard/any patterns with specified lengths.
 *
 * This validator handles patterns that accept any content as long as
 * it matches the specified length, typically used for flexible data
 * reception where content validation is not required.
 *
 * Example: { type: 'any', length: 32 } accepts any 32 bytes
 */
export class AnyReceivePatternValidator implements ReceivePatternValidator {
  /**
   * Checks if the pattern is a wildcard/any pattern.
   *
   * @param pattern - The receive pattern to check
   * @returns true if the pattern type is 'any'
   */
  canValidate(pattern: RadioReceivePattern): boolean {
    return pattern.type === "any";
  }

  /**
   * Validates that the data length matches the expected length.
   *
   * @param data - The received data
   * @param pattern - The any pattern
   * @returns true if the data length matches the expected length
   */
  validate(data: Buffer, pattern: RadioReceivePattern): boolean {
    if (pattern.type !== "any") return false;
    return data.length === pattern.length;
  }

  /**
   * Returns the complete data for any patterns.
   *
   * @param data - The received data
   * @param _pattern - The pattern (unused for any patterns)
   * @returns The complete data as-is
   */
  extractData(data: Uint8Array, _pattern: RadioReceivePattern): Uint8Array {
    return data;
  }

  /**
   * Returns the specified length for any patterns.
   *
   * @param _pattern - The any pattern
   * @returns The expected length from the pattern
   */
  getExpectedLength(_pattern: RadioReceivePattern): number {
    if (_pattern.type !== "any") return 1;
    return _pattern.length;
  }
}

/**
 * Helper function for resolving expressions in pattern validators.
 *
 * This function is used by pattern validators to resolve dynamic expressions
 * that may appear in pattern configurations, such as data length references.
 *
 * @param expression - The expression to resolve
 * @param context - The protocol context for variable resolution
 * @returns The resolved value
 */
function resolveExpression(expression: string | number, context: ProtocolContext): string | number {
  if (typeof expression === "number") {
    return expression;
  }

  return ExpressionResolverFactory.resolve(expression, context);
}
