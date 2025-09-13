import type { ProtocolContext } from "../protocol-context.js";
import { ExpressionResolverFactory } from "./expression-resolvers.js";

/**
 * Expression Utilities: Protocol Expression Resolution
 *
 * This module provides utility functions for resolving expressions within
 * radio protocol steps. It handles both simple values and complex expressions
 * that reference context variables or character codes.
 *
 * Purpose:
 * - Resolves expressions to their actual values during protocol execution
 * - Provides backward compatibility for existing protocol definitions
 * - Handles both single expressions and arrays of expressions
 * - Integrates with the ExpressionResolverFactory for complex resolution
 * - Supports context variable references and character code conversions
 * - Supports multi-byte expressions for addresses and other multi-byte values
 *
 * Design Rationale:
 * - Expression resolution allows protocols to be dynamic and context-aware
 * - Backward compatibility ensures existing protocols continue to work
 * - Array support enables batch processing of multiple expressions
 * - Integration with ExpressionResolverFactory provides extensible resolution
 * - Type safety ensures expressions resolve to appropriate value types
 * - Multi-byte support enables proper handling of addresses and other multi-byte values
 *
 * Usage:
 * These utilities are used by protocol executors to resolve dynamic values
 * in protocol steps, such as addresses, data lengths, and character codes
 * that depend on the current execution context.
 */

/**
 * Expands multi-byte expressions into arrays of bytes.
 *
 * This function handles expressions in the format "expression:size" where
 * expression is a value that should be converted to multiple bytes and
 * size is the number of bytes to use.
 *
 * @param expressions - Array of expressions to expand
 * @param context - The protocol context containing state and variables
 * @returns Array of resolved values with multi-byte expressions expanded
 *
 * Example:
 * ```typescript
 * const expanded = expandMultiByteExpressions(['S', 'address:2', 64], context);
 * // Returns: ['S', highByte, lowByte, 64] for address 0x1000
 * ```
 */
export const expandMultiByteExpressions = (expressions: (string | number)[], context: ProtocolContext): (string | number)[] => {
  const result: (string | number)[] = [];

  for (const expr of expressions) {
    if (typeof expr === 'string' && expr.includes(':')) {
      // This is a multi-byte expression with explicit size
      const [valueExpr, sizeStr] = expr.split(':');
      const size = parseInt(sizeStr, 10);

      if (isNaN(size) || size <= 0) {
        throw new Error(`Invalid multi-byte size: ${sizeStr}`);
      }

      // Resolve the value expression first
      const value = ExpressionResolverFactory.resolve(valueExpr, context);

      if (typeof value !== 'number') {
        throw new Error(`Multi-byte expression requires a numeric value, got: ${typeof value}`);
      }

      // Convert the number to bytes in big-endian format for addresses
      // Baofeng radios expect addresses in big-endian format (high byte first)
      for (let i = size - 1; i >= 0; i--) {
        result.push((value >> (i * 8)) & 0xFF);
      }
    } else if (typeof expr === 'string' && (expr === 'address' || expr.endsWith(':addressSize'))) {
      // Special case: 'address' or 'field:addressSize' without explicit size uses memoryConfig.addressSize
      let valueExpr: string;
      if (expr === 'address') {
        valueExpr = expr;
      } else {
        // Extract the field name from 'field:addressSize'
        valueExpr = expr.replace(':addressSize', '');
      }

      const value = ExpressionResolverFactory.resolve(valueExpr, context);

      if (typeof value !== 'number') {
        throw new Error(`Address expression requires a numeric value, got: ${typeof value}`);
      }

      // Use the address size from memory config
      const addressSize = context.memoryConfig.addressSize;

      // Convert the number to bytes in big-endian format for addresses
      for (let i = addressSize - 1; i >= 0; i--) {
        result.push((value >> (i * 8)) & 0xFF);
      }
    } else {
      // Regular expression, resolve normally
      result.push(resolveExpression(expr, context));
    }
  }

  return result;
};

/**
 * Resolves an array of expressions to their actual values.
 *
 * This function processes each expression in the array and resolves it to
 * its corresponding value using the provided protocol context. It maintains
 * the order of expressions in the result array.
 *
 * @param expressions - Array of expressions to resolve (strings or numbers)
 * @param context - The protocol context containing state and variables
 * @returns Array of resolved values in the same order as input expressions
 *
 * Example:
 * ```typescript
 * const resolved = resolveExpressions(['address', 0x01, "'A'"], context);
 * // Returns: [currentAddress, 1, 65]
 * ```
 */
export const resolveExpressions = (expressions: (string | number)[], context: ProtocolContext): (string | number)[] => {
  return expandMultiByteExpressions(expressions, context);
};

/**
 * Resolves a single expression to its actual value.
 *
 * This function handles the resolution of individual expressions, supporting
 * both literal values (numbers) and dynamic expressions (strings) that may
 * reference context variables or represent character codes.
 *
 * @param expression - The expression to resolve (string or number)
 * @param context - The protocol context containing state and variables
 * @returns The resolved value (string or number)
 *
 * Example:
 * ```typescript
 * const address = resolveExpression('address', context); // Returns current address
 * const charCode = resolveExpression("'A'", context);    // Returns 65
 * const literal = resolveExpression(0x01, context);      // Returns 1
 * ```
 */
export const resolveExpression = (expression: string | number, context: ProtocolContext): string | number => {
  if (typeof expression === "number") {
    return expression;
  }

  return ExpressionResolverFactory.resolve(expression, context);
};
