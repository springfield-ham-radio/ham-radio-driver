import type { ProtocolContext } from '../protocol-context.js';

/**
 * Expression Resolvers: Dynamic Expression Resolution System
 *
 * This module implements a factory pattern for resolving dynamic expressions
 * within radio protocol steps. It provides specialized resolvers for different
 * types of expressions including context variables, character codes, and fallback values.
 *
 * Purpose:
 * - Resolves context variable references to their current values
 * - Converts character code expressions to their numeric representations
 * - Provides fallback resolution for unhandled expressions
 * - Centralizes expression resolution logic through a factory pattern
 * - Supports extensible resolver registration for new expression types
 *
 * Design Rationale:
 * - Factory pattern allows easy addition of new resolver types
 * - Each resolver specializes in a specific expression format
 * - Context variable resolution enables dynamic protocol behavior
 * - Character code support simplifies protocol definition
 * - Fallback resolver ensures all expressions can be handled
 *
 * Usage:
 * The ExpressionResolverFactory is used by protocol executors to resolve
 * dynamic values in protocol steps, enabling context-aware communication
 * with radio devices.
 */

/**
 * Interface for expression resolvers that can handle specific expression types.
 *
 * Each resolver implements this interface to provide specialized resolution
 * logic for different types of expressions encountered in protocol steps.
 */
export interface ExpressionResolver {
  /**
   * Determines if this resolver can handle the given expression.
   *
   * @param expression - The expression to check
   * @returns true if this resolver can handle the expression, false otherwise
   */
  canResolve(expression: string | number): boolean;

  /**
   * Resolves the expression to its actual value.
   *
   * @param expression - The expression to resolve
   * @param context - The protocol context containing state and variables
   * @returns The resolved value, or undefined if not handled
   */
  resolve(expression: string | number, context: ProtocolContext): string | number | undefined;
}

/**
 * Resolves context variable references to their current values.
 *
 * This resolver handles expressions that reference variables stored in the
 * protocol context, such as current addresses, segment information, and
 * previously received data.
 *
 * Supported Variables:
 * - 'address': Current segment address
 * - 'segment.chunkSize': Memory chunk size configuration
 * - 'segment.startAddress': Start address of current segment
 * - 'segment.endAddress': End address of current segment
 * - 'segment.data': Data from current segment
 * - 'lastReceivedData': Most recently received data
 */
export class ContextVariableResolver implements ExpressionResolver {
  private static readonly CONTEXT_VARIABLES = new Set([
    'address',
    'segment.chunkSize',
    'segment.startAddress',
    'segment.endAddress',
    'segment.data',
    'lastReceivedData',
  ]);

  /**
   * Checks if the expression is a known context variable.
   *
   * @param expression - The expression to check
   * @returns true if the expression is a context variable reference
   */
  canResolve(expression: string | number): boolean {
    return typeof expression === 'string' && ContextVariableResolver.CONTEXT_VARIABLES.has(expression);
  }

  /**
   * Resolves context variable references to their current values.
   *
   * @param expression - The context variable name
   * @param context - The protocol context containing the variables
   * @returns The current value of the context variable, or undefined if not found
   */
  resolve(expression: string, context: ProtocolContext): string | number | undefined {
    switch (expression) {
      case 'address':
        return context.currentSegment?.currentAddress || 0;
      case 'segment.chunkSize':
        return context.memoryConfig.chunkSize;
      case 'segment.startAddress':
        return context.currentSegment?.config.startAddress || 0;
      case 'segment.endAddress':
        return context.currentSegment?.config.endAddress || 0;
      case 'segment.data':
        return context.variables.get('segment.data') || new Uint8Array(0);
      case 'lastReceivedData':
        return context.variables.get('lastReceivedData') || new Uint8Array(0);
      default:
        return undefined;
    }
  }
}

/**
 * Resolves variables from the context variables map.
 *
 * This resolver handles expressions that reference variables stored in the
 * protocol context's variables map, such as dynamic data lengths and other
 * runtime variables.
 *
 * Example: 'dataLength' resolves to the value stored in context.variables.get('dataLength')
 */
export class VariablesMapResolver implements ExpressionResolver {
  /**
   * Checks if the expression is a string that's not a character code or context variable.
   *
   * @param expression - The expression to check
   * @returns true if the expression is a string that should be resolved from variables map
   */
  canResolve(expression: string | number): boolean {
    if (typeof expression !== 'string') return false;

    // Don't handle character codes (they should be handled by CharacterCodeResolver)
    if (expression.startsWith("'") && expression.endsWith("'")) return false;

    // Don't handle context variables (they should be handled by ContextVariableResolver)
    const contextVariables = new Set([
      'address',
      'segment.chunkSize',
      'segment.startAddress',
      'segment.endAddress',
      'segment.data',
      'lastReceivedData',
    ]);
    if (contextVariables.has(expression)) return false;

    return true;
  }

  /**
   * Resolves variable references from the context variables map.
   *
   * @param expression - The variable name
   * @param context - The protocol context containing the variables map
   * @returns The value from the variables map, or the expression unchanged if not found
   */
  resolve(expression: string, context: ProtocolContext): string | number {
    const value = context.variables.get(expression);
    if (value !== undefined) {
      return value;
    }
    return expression;
  }
}

/**
 * Resolves character code expressions to their numeric values.
 *
 * This resolver handles expressions in the format "'X'" where X is a single
 * character, converting them to their ASCII character codes.
 *
 * Example: "'A'" resolves to 65, "'0'" resolves to 48
 */
export class CharacterCodeResolver implements ExpressionResolver {
  /**
   * Checks if the expression is a character code in single quotes.
   *
   * @param expression - The expression to check
   * @returns true if the expression is a character code
   */
  canResolve(expression: string | number): boolean {
    return typeof expression === 'string' && expression.startsWith("'") && expression.endsWith("'");
  }

  /**
   * Converts character code expression to its numeric value.
   *
   * @param expression - The character code expression (e.g., "'A'")
   * @returns The ASCII character code
   */
  resolve(expression: string): number {
    return expression.charCodeAt(1);
  }
}

/**
 * Fallback resolver for unhandled expressions.
 *
 * This resolver acts as a catch-all for expressions that don't match
 * any other resolver patterns. It simply returns the expression as-is.
 */
export class DefaultResolver implements ExpressionResolver {
  /**
   * Always returns true as this is the fallback resolver.
   *
   * @returns true (this resolver handles all unhandled expressions)
   */
  canResolve(): boolean {
    return true; // Fallback resolver
  }

  /**
   * Returns the expression unchanged as a fallback.
   *
   * @param expression - The expression to return
   * @returns The expression unchanged
   */
  resolve(expression: string | number): string | number {
    return expression;
  }
}

/**
 * Factory for creating and managing expression resolvers.
 *
 * This factory maintains a registry of resolvers and provides a unified
 * interface for resolving expressions regardless of their type.
 */
export class ExpressionResolverFactory {
  /**
   * Registry of all available resolvers in order of precedence.
   * Resolvers are checked in order, and the first one that can handle
   * an expression is used.
   */
  private static readonly resolvers: ExpressionResolver[] = [
    new ContextVariableResolver(),
    new VariablesMapResolver(),
    new CharacterCodeResolver(),
    new DefaultResolver(),
  ];

  /**
   * Resolves an expression using the appropriate resolver.
   *
   * This method finds the first resolver that can handle the expression
   * and delegates the resolution to that resolver.
   *
   * @param expression - The expression to resolve
   * @param context - The protocol context for variable resolution
   * @returns The resolved value
   * @throws Error if no resolver is found (should not happen with DefaultResolver)
   *
   * Example:
   * ```typescript
   * const value = ExpressionResolverFactory.resolve('address', context);
   * const charCode = ExpressionResolverFactory.resolve("'A'", context);
   * ```
   */
  static resolve(expression: string | number, context: ProtocolContext): string | number {
    for (const resolver of this.resolvers) {
      if (resolver.canResolve(expression)) {
        const result = resolver.resolve(expression, context);
        if (result !== undefined) {
          return result;
        }
      }
    }
    throw new Error(`No resolver found for expression: ${expression}`);
  }
}
