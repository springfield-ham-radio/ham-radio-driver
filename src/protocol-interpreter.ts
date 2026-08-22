import type { ProtocolContext } from './protocol-context.js';
import { CancelledException } from './cancelled-exception.js';
import { StepExecutorRegistry } from './executors/index.js';

/**
 * ProtocolInterpreter is responsible for executing radio communication protocols
 * by interpreting and executing a series of steps defined in a protocol configuration.
 *
 * The interpreter manages the execution flow, handles cancellation requests,
 * tracks progress, and delegates individual step execution to registered executors.
 *
 * @example
 * ```typescript
 * const context = new ProtocolContext();
 * const interpreter = new ProtocolInterpreter(context);
 *
 * // Execute a read memory protocol
 * await interpreter.executeProtocol(protocolConfig, 'readMemory', buffer);
 *
 * // Execute a write memory protocol
 * await interpreter.executeProtocol(protocolConfig, 'writeMemory', buffer);
 * ```
 */
export class ProtocolInterpreter {
  private context: ProtocolContext;
  private executorRegistry: StepExecutorRegistry;

  /**
   * Creates a new ProtocolInterpreter instance.
   *
   * @param context - The protocol context that contains shared state and configuration
   *                  for the protocol execution, including memory buffer, progress
   *                  indicators, and other execution parameters.
   */
  constructor(context: ProtocolContext) {
    this.context = context;
    this.executorRegistry = new StepExecutorRegistry();
  }

  /**
   * Executes a protocol for the specified operation.
   *
   * This method processes the steps defined in the protocol for the given operation,
   * executing each step sequentially while handling cancellation requests and
   * updating progress indicators.
   *
   * @param protocol - The protocol configuration object containing step definitions
   *                   for different operations (readMemory, writeMemory, etc.).
   *                   The protocol should have a property matching the operation name
   *                   that contains an array of step configurations.
   * @param operation - The specific operation to execute. Must be either 'readMemory'
   *                    or 'writeMemory'. This determines which set of steps from the
   *                    protocol configuration will be executed.
   * @param buffer - Optional memory buffer to use for the operation. If provided,
   *                 this buffer will be set in the protocol context and the buffer
   *                 offset will be reset to 0. If not provided, any existing buffer
   *                 in the context will be used.
   *
   * @throws {CancelledException} When the protocol execution is cancelled via the
   *                              progress indicator's cancellation mechanism.
   * @throws {Error} When step execution fails or the protocol configuration is invalid.
   *
   * @example
   * ```typescript
   * const protocol = {
   *   readMemory: [
   *     { type: 'send', data: [0x01, 0x02] },
   *     { type: 'receive', length: 64 }
   *   ],
   *   writeMemory: [
   *     { type: 'send', data: [0x03, 0x04] },
   *     { type: 'receive', pattern: 'OK' }
   *   ]
   * };
   *
   * // Read memory operation
   * await interpreter.executeProtocol(protocol, 'readMemory', new Uint8Array(64));
   *
   * // Write memory operation
   * await interpreter.executeProtocol(protocol, 'writeMemory', dataBuffer);
   * ```
   */
  async executeProtocol(protocol: any, operation: 'readMemory' | 'writeMemory', buffer?: Uint8Array): Promise<void> {
    const steps = protocol[operation];

    // Set the buffer and offset in context
    if (buffer) {
      this.context.memoryBuffer = buffer;
      this.context.bufferOffset = 0;
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Check for cancellation before executing each step
      if (this.context.progressIndicator?.isCanceled) {
        throw new CancelledException('Protocol execution was cancelled');
      }

      // Start UI logging for this command if UI logger is available
      if (this.context.uiLogger) {
        this.context.uiLogger.startCommand(i, steps.length, operation, step);
      }

      this.context.stepIndex = i;
      this.context.totalSteps = steps.length;

      try {
        await this.executorRegistry.executeStep(step, this.context);

        // Log successful command completion if UI logger is available
        if (this.context.uiLogger) {
          this.context.uiLogger.logCommandSuccess(i, steps.length, operation, step, this.context);
        }
      } catch (error) {
        // Log command failure if UI logger is available
        if (this.context.uiLogger) {
          this.context.uiLogger.logCommandFailure(i, steps.length, operation, step, error as Error, this.context);
        }
        throw error;
      }

      // Update progress after each step
      if (this.context.progressIndicator) {
        const progress = (i + 1) / steps.length;
        this.context.progressIndicator.setValue(progress);
      }
    }
  }

  /**
   * Registers a custom executor for protocol steps.
   *
   * This method allows for extensibility by registering custom step executors
   * that can handle specialized protocol operations beyond the built-in executors.
   * Custom executors must implement the appropriate executor interface and will
   * be available for use in protocol step configurations.
   *
   * @param executor - The custom executor instance to register. The executor should
   *                   implement the appropriate executor interface and be capable
   *                   of handling specific step types defined in protocol configurations.
   *
   * @example
   * ```typescript
   * class CustomExecutor {
   *   async execute(step: any, context: ProtocolContext): Promise<void> {
   *     // Custom execution logic
   *   }
   * }
   *
   * const customExecutor = new CustomExecutor();
   * interpreter.registerExecutor(customExecutor);
   * ```
   */
  registerExecutor(executor: any): void {
    this.executorRegistry.registerExecutor(executor);
  }
}
