import { LogLayer } from 'loglayer';
import { BaseTransport } from '@loglayer/transport';
import { UILogger } from './ui-logger.js';

/**
 * UI Logger Factory: JSON Transport Configuration
 *
 * This module provides factory functions for creating UI loggers configured
 * with JSON transport for easy parsing and display in user interfaces.
 *
 * Purpose:
 * - Creates UI loggers with JSON transport configuration
 * - Provides consistent JSON formatting for UI consumption
 * - Enables easy parsing of command-level log data
 * - Supports protocol debugging in UI environments
 * - Maintains separation from debug logging
 *
 * Design Rationale:
 * - JSON transport ensures structured data output
 * - Factory pattern provides consistent configuration
 * - Separation of concerns between logging and transport
 * - Easy integration with UI frameworks
 * - Configurable transport options for different use cases
 */

/**
 * Custom LogLayer transport for capturing UI log entries.
 */
class UILogTransport extends BaseTransport<any> {
  #callback: (logEntry: any) => void;

  constructor(callback: (logEntry: any) => void) {
    // Pass a dummy logger to BaseTransport
    super({ logger: { log: () => {} }, id: 'ui-logger-transport', enabled: true });
    this.#callback = callback;
  }

  shipToLogger(params: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: params.logLevel,
      message: params.messages.join(' '),
      data: params.data,
      hasData: params.hasData,
    };
    this.#callback(logEntry);
    return [];
  }
}

/**
 * Configuration options for creating a UI logger.
 */
export interface UILoggerConfig {
  /**
   * Whether to enable console output for debugging the UI logger itself
   */
  enableConsoleDebug?: boolean;

  /**
   * Custom transport configuration (optional)
   */
  customTransport?: any;
}

/**
 * Creates a UI logger configured with JSON transport for UI display.
 *
 * This function creates a LogLayer instance configured with JSON transport
 * and wraps it in a UILogger for command-level logging. The JSON transport
 * ensures that all log data is output in a structured format that can be
 * easily parsed by UI applications.
 *
 * @param config - Configuration options for the UI logger
 * @returns A UILogger instance configured for UI display
 *
 * @example
 * ```typescript
 * // Create a basic UI logger
 * const uiLogger = createUILogger();
 *
 * // Create a UI logger with console debug enabled
 * const uiLogger = createUILogger({ enableConsoleDebug: true });
 *
 * // Use with protocol context
 * context.uiLogger = uiLogger;
 * ```
 */
export function createUILogger(config: UILoggerConfig = {}): UILogger {
  // By default, just print to console as JSON
  const defaultCallback = (logEntry: any) => {
    console.log(JSON.stringify(logEntry));
  };
  const transport = config.customTransport || new UILogTransport(defaultCallback);
  const logger = new LogLayer({
    transport,
    consoleDebug: config.enableConsoleDebug ?? false,
  });
  logger.setLevel('debug');
  return new UILogger(logger);
}

/**
 * Creates a UI logger that outputs to a custom function.
 *
 * This function creates a UI logger that sends all log entries to a custom
 * callback function, allowing for flexible integration with different UI
 * frameworks and logging systems.
 *
 * @param callback - Function to receive log entries
 * @param config - Additional configuration options
 * @returns A UILogger instance that sends data to the callback
 *
 * @example
 * ```typescript
 * // Create a UI logger that sends data to a custom function
 * const uiLogger = createUILoggerWithCallback((logEntry) => {
 *   // Send to UI framework
 *   window.postMessage({ type: 'log', data: logEntry }, '*');
 * });
 * ```
 */
export function createUILoggerWithCallback(
  callback: (logEntry: any) => void,
  config: UILoggerConfig = {},
): UILogger {
  const transport = new UILogTransport(callback);
  const logger = new LogLayer({
    transport,
    consoleDebug: config.enableConsoleDebug ?? false,
  });
  logger.setLevel('debug');
  return new UILogger(logger);
}
