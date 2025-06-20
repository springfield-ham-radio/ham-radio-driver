import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import { resolveExpression } from '../utils/expression-utils.js';
import { StepExecutor } from './base.js';

/**
 * Set Variable Executor: Variable Assignment Implementation
 *
 * This executor is responsible for setting variables within the protocol context
 * during radio communication protocols. It implements the StepExecutor interface to
 * handle 'setVariable' protocol steps.
 *
 * Purpose:
 * - Assigns values to variables in the protocol context for later use
 * - Resolves expressions in variable values for dynamic content
 * - Provides persistent state management across protocol steps
 * - Enables protocol-driven variable manipulation and data storage
 * - Supports complex protocol flows with shared state
 *
 * Design Rationale:
 * - Context-based variable storage ensures state persistence across steps
 * - Expression resolution allows for dynamic variable values based on context
 * - Promise-based execution allows for proper async/await integration
 * - Simple assignment model provides clear and predictable behavior
 * - Variable scope management enables complex protocol orchestration
 *
 * Usage:
 * The executor is used by the protocol interpreter to handle 'setVariable' steps
 * in radio communication protocols, typically for storing command responses,
 * calculated values, or intermediate results for use in subsequent steps.
 */
export class SetVariableExecutor implements StepExecutor {
  /**
   * Determines if this executor can handle the given protocol step.
   *
   * @param step - The protocol step to check
   * @returns true if the step contains a 'setVariable' property, false otherwise
   */
  canExecute(step: RadioProtocolStep): boolean {
    return 'setVariable' in step;
  }

  /**
   * Executes a setVariable step by assigning a value to a variable in the context.
   *
   * This method resolves any expressions in the variable value and stores
   * the resulting value in the protocol context's variable map. The variable
   * can then be referenced by name in subsequent protocol steps.
   *
   * @param step - The protocol step containing setVariable configuration
   * @param context - The protocol context containing state and utilities
   * @throws Error if expression resolution fails or invalid configuration provided
   *
   * Example:
   * ```typescript
   * const executor = new SetVariableExecutor();
   * await executor.execute({
   *   setVariable: {
   *     name: 'channelNumber',
   *     value: 5
   *   }
   * }, context);
   * ```
   */
  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const config = (step as any).setVariable;
    const { name, value } = config;
    const resolvedValue = resolveExpression(value, context);
    context.variables.set(name, resolvedValue);
  }
}
