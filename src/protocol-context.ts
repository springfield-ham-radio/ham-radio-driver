import type { SerialPort } from "serialport";
import type { RadioProgressIndicator, RadioMemoryConfig, RadioMemorySegment } from "@springfield/ham-radio-api";
import type { UILogger } from "@springfield/ham-radio-utils";

/**
 * Protocol context for execution of radio communication protocols.
 *
 * This interface provides the complete execution environment for radio protocol
 * operations, including serial communication, variable storage, memory management,
 * and progress tracking. It serves as the central state container that is passed
 * between protocol steps during execution.
 *
 * The context maintains both persistent state (like the serial port connection
 * and memory configuration) and transient state (like variables and buffer
 * positions) that change during protocol execution.
 */
export interface ProtocolContext {
  /**
   * The serial port connection to the radio device.
   *
   * This is the primary communication channel for sending commands to and
   * receiving responses from the radio. All protocol operations that require
   * device communication will use this port instance.
   */
  port: SerialPort;

  /**
   * Map of variables used during protocol execution.
   *
   * Variables can be set and retrieved by protocol steps to store intermediate
   * values, configuration data, or results from previous operations. This
   * provides a way for steps to communicate and share data with each other.
   *
   * @example
   * ```typescript
   * // Setting a variable
   * context.variables.set('responseLength', 64);
   *
   * // Retrieving a variable
   * const length = context.variables.get('responseLength');
   * ```
   */
  variables: Map<string, any>;

  /**
   * Information about the currently active memory segment being processed.
   *
   * When performing memory operations (read/write), this contains details about
   * the specific memory segment being worked with, including its configuration
   * and the current address position within that segment.
   *
   * This is undefined when not actively processing a memory segment.
   */
  currentSegment?: {
    /**
     * The name/identifier of the memory segment.
     */
    name: string;

    /**
     * Configuration details for the memory segment, including size, address
     * range, and other segment-specific properties.
     */
    config: RadioMemorySegment;

    /**
     * The current address position within the memory segment.
     *
     * This tracks the progress of read/write operations within the segment
     * and is updated as operations proceed.
     */
    currentAddress: number;
  };

  /**
   * Configuration for the radio's memory structure.
   *
   * Contains information about the overall memory layout, including segment
   * definitions, address ranges, and memory organization. This is used to
   * understand how to properly access and manipulate the radio's memory.
   */
  memoryConfig: RadioMemoryConfig;

  /**
   * Logger instance for protocol execution logging.
   *
   * Used to record debug information, errors, and execution progress during
   * protocol operations. The logger should implement the ILogLayer interface
   * for consistent logging behavior.
   */
  logger: any; // ILogLayer type

  /**
   * UI Logger instance for command-level logging.
   *
   * Used to capture command-level information for display in the UI. This
   * logger provides structured JSON logging that can be easily parsed and
   * displayed in user interfaces for protocol debugging.
   */
  uiLogger?: UILogger;

  /**
   * Buffer for read/write operations on radio memory.
   *
   * This buffer holds data being read from or written to the radio's memory.
   * It's used as a temporary storage area during memory transfer operations
   * and is sized according to the memory segment being processed.
   */
  memoryBuffer: Uint8Array;

  /**
   * Current offset position within the memory buffer.
   *
   * Tracks the current read/write position within the memoryBuffer. This
   * is updated as data is read from or written to the buffer during
   * memory operations.
   */
  bufferOffset: number;

  /**
   * Progress indicator for cancellation support.
   *
   * Provides a way to report progress and check for cancellation requests
   * during long-running protocol operations. This allows the user to
   * cancel operations and provides feedback on operation progress.
   *
   * The progress indicator should be checked periodically during operations
   * to respect cancellation requests and update progress status.
   */
  progressIndicator: RadioProgressIndicator;
}
