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
 *
 * Design Rationale:
 * - Expression resolution allows protocols to be dynamic and context-aware
 * - Backward compatibility ensures existing protocols continue to work
 * - Array support enables batch processing of multiple expressions
 * - Integration with ExpressionResolverFactory provides extensible resolution
 * - Type safety ensures expressions resolve to appropriate value types
 *
 * Usage:
 * These utilities are used by protocol executors to resolve dynamic values
 * in protocol steps, such as addresses, data lengths, and character codes
 * that depend on the current execution context.
 */

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
  return expressions.map((expr) => resolveExpression(expr, context));
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
