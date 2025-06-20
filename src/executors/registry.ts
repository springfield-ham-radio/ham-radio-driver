import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import { StepExecutor } from './base.js';
import { SendReceiveExecutor } from './send-receive-executor.js';
import { SendExecutor } from './send-executor.js';
import { ReceiveExecutor } from './receive-executor.js';
import { ReadSegmentExecutor } from './read-segment-executor.js';
import { WriteSegmentExecutor } from './write-segment-executor.js';
import { SetVariableExecutor } from './set-variable-executor.js';

/**
 * Step Executor Registry: Protocol Step Execution Management
 *
 * This registry is responsible for managing and coordinating all step executors
 * in the ham radio protocol system. It implements a priority-based executor
 * selection mechanism to handle different types of protocol steps.
 *
 * Purpose:
 * - Maintains a collection of step executors for different protocol step types
 * - Provides automatic executor selection based on step content and priority
 * - Supports dynamic registration of custom executors with priority control
 * - Ensures proper execution flow for complex radio communication protocols
 * - Centralizes executor management and provides a unified execution interface
 *
 * Design Rationale:
 * - The registry uses a priority-based system where more specific executors
 *   are checked before general-purpose ones to ensure proper step handling
 * - Executors are ordered by specificity: SendReceiveExecutor (most specific)
 *   to SetVariableExecutor (most general)
 * - Custom executors can be registered with higher priority using unshift()
 *   to ensure they are checked before built-in executors
 * - The registry pattern provides extensibility while maintaining a clean
 *   separation of concerns between step types and their execution logic
 *
 * Usage:
 * The registry is used by the protocol interpreter to delegate step execution
 * to the appropriate executor based on the step type and configuration.
 * Custom executors can be registered to handle specialized protocol steps
 * or override default behavior for specific use cases.
 */
export class StepExecutorRegistry {
  private executors: StepExecutor[] = [];

  /**
   * Initializes the registry with all built-in step executors.
   *
   * The executors are registered in order of specificity, with more specific
   * executors (like SendReceiveExecutor) placed before general-purpose ones
   * (like SetVariableExecutor). This ordering ensures that the most appropriate
   * executor is selected for each step type.
   *
   * Built-in Executors (in priority order):
   * - SendReceiveExecutor: Handles combined send/receive operations
   * - SendExecutor: Handles send-only operations
   * - ReceiveExecutor: Handles receive-only operations
   * - ReadSegmentExecutor: Handles memory segment reading operations
   * - WriteSegmentExecutor: Handles memory segment writing operations
   * - SetVariableExecutor: Handles variable assignment operations
   */
  constructor() {
    // Register all executors in order of specificity
    this.executors = [
      new SendReceiveExecutor(),
      new SendExecutor(),
      new ReceiveExecutor(),
      new ReadSegmentExecutor(),
      new WriteSegmentExecutor(),
      new SetVariableExecutor(),
    ];
  }

  /**
   * Executes a protocol step by delegating to the appropriate executor.
   *
   * This method automatically selects the most suitable executor for the given
   * step by checking each registered executor's canExecute() method in priority
   * order. The first executor that can handle the step will be used for execution.
   *
   * The method provides a unified interface for step execution while maintaining
   * the separation of concerns between different step types and their specific
   * execution logic.
   *
   * @param step - The protocol step to execute, containing the step configuration
   * @param context - The protocol context containing state, utilities, and execution environment
   * @throws Error if no executor is found that can handle the given step type
   *
   * Example:
   * ```typescript
   * const registry = new StepExecutorRegistry();
   * await registry.executeStep({
   *   sendReceive: {
   *     send: 'AT',
   *     receive: { type: 'exact', value: 'OK' }
   *   }
   * }, context);
   * ```
   */
  async executeStep(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const executor = this.executors.find((exec) => exec.canExecute(step));

    if (!executor) {
      throw new Error(`No executor found for step type: ${Object.keys(step)[0]}`);
    }

    await executor.execute(step, context);
  }

  /**
   * Registers a custom executor with high priority in the registry.
   *
   * This method allows for dynamic registration of custom step executors,
   * placing them at the beginning of the executor list to ensure they are
   * checked before built-in executors. This enables extensibility and
   * customization of the protocol execution system.
   *
   * Custom executors should implement the StepExecutor interface and provide
   * appropriate canExecute() and execute() methods. They will be given
   * priority over built-in executors for step type matching.
   *
   * @param executor - The custom step executor to register
   *
   * Example:
   * ```typescript
   * class CustomExecutor implements StepExecutor {
   *   canExecute(step: RadioProtocolStep): boolean {
   *     return 'customStep' in step;
   *   }
   *
   *   async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
   *     // Custom execution logic
   *   }
   * }
   *
   * const registry = new StepExecutorRegistry();
   * registry.registerExecutor(new CustomExecutor());
   * ```
   */
  registerExecutor(executor: StepExecutor): void {
    this.executors.unshift(executor); // Add to beginning for higher priority
  }
}
