import { SerialPort } from 'serialport';
import { toHexWords } from '@springfield/ham-radio-utils';
import * as fs from 'fs';

/**
 * Interface for individual log entries in the JSON structure.
 * Note: data is stored as number[] instead of Uint8Array because JSON.stringify()
 * converts Uint8Array to an object with numeric keys rather than an array.
 */
interface LogEntry {
  timestamp: string;
  elapsedMs: number;
  direction: 'SEND' | 'RECV';
  data: number[]; // Raw byte values (0-255) representing the Uint8Array data
  description?: string;
}

/**
 * Interface for the complete JSON log structure.
 */
interface SerialLogData {
  metadata: {
    startTime: string;
    endTime?: string;
    totalEntries: number;
    version: string;
  };
  entries: LogEntry[];
}

/**
 * SerialLogger provides logging capabilities for serial port communication
 * to enable easy comparison with sniffer output.
 *
 * This class wraps SerialPort instances and logs all read/write operations
 * in a JSON format that makes it easy to render and compare with sniffer output.
 *
 * Note: Data is stored as number[] instead of Uint8Array in the JSON because
 * JSON.stringify() converts Uint8Array to an object with numeric keys rather
 * than preserving it as an array. The number[] represents raw byte values (0-255).
 */
export class SerialLogger {
  private logFile: string;
  private logData!: SerialLogData;
  private startTime: number;
  private currentBuffer: number[] = [];
  private currentDirection: 'SEND' | 'RECV' | null = null;
  private currentStartTime: number = 0;
  private currentDescription?: string;

  /**
   * Creates a new SerialLogger instance.
   *
   * @param logFile - Optional path to the JSON log file. If not provided, a timestamped file will be created
   */
  constructor(logFile?: string) {
    this.startTime = Date.now();

    if (logFile) {
      this.logFile = logFile;
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = `radio-driver-${timestamp}.json`;
    }

    this.initializeLogData();
  }

  /**
   * Initializes the log data structure.
   */
  private initializeLogData(): void {
    this.logData = {
      metadata: {
        startTime: new Date().toISOString(),
        totalEntries: 0,
        version: '1.0.0',
      },
      entries: [],
    };
  }

  /**
   * Writes the current log data to the JSON file.
   */
  private writeLogFile(): void {
    try {
      const jsonData = JSON.stringify(this.logData, null, 2);
      fs.writeFileSync(this.logFile, jsonData, 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Flushes the current buffer and creates a log entry if there's buffered data.
   */
  private flushBuffer(): void {
    if (this.currentDirection) {
      const elapsedMs = this.currentStartTime - this.startTime;
      const timestamp = this.getTimestamp(this.currentStartTime);

      const entry: LogEntry = {
        timestamp,
        elapsedMs,
        direction: this.currentDirection,
        data: [...this.currentBuffer],
        description: this.currentDescription,
      };

      this.logData.entries.push(entry);
      this.logData.metadata.totalEntries++;

      // Clear the buffer
      this.currentBuffer = [];
      this.currentDirection = null;
      this.currentDescription = undefined;
    }
  }

  /**
   * Logs data being sent to the radio.
   *
   * @param data - The data being sent
   * @param description - Optional description of the operation
   */
  logSend(data: Uint8Array, description?: string): void {
    const currentTime = Date.now();

    // If direction changed, flush the current buffer
    if (this.currentDirection && this.currentDirection !== 'SEND') {
      this.flushBuffer();
    }

    // If this is the first data or direction changed, set up new buffer
    if (!this.currentDirection) {
      this.currentDirection = 'SEND';
      this.currentStartTime = currentTime;
      this.currentDescription = description;
    }

    // Add data to current buffer
    this.currentBuffer.push(...Array.from(data));
  }

  /**
   * Logs data being received from the radio.
   *
   * @param data - The data being received
   * @param description - Optional description of the operation
   */
  logReceive(data: Uint8Array, description?: string): void {
    const currentTime = Date.now();

    // If direction changed, flush the current buffer
    if (this.currentDirection && this.currentDirection !== 'RECV') {
      this.flushBuffer();
    }

    // If this is the first data or direction changed, set up new buffer
    if (!this.currentDirection) {
      this.currentDirection = 'RECV';
      this.currentStartTime = currentTime;
      this.currentDescription = description;
    }

    // Add data to current buffer
    this.currentBuffer.push(...Array.from(data));
  }

  /**
   * Gets a formatted timestamp relative to the start time.
   *
   * @param timestamp - Optional timestamp to use instead of current time
   * @returns Formatted timestamp string
   */
  private getTimestamp(timestamp?: number): string {
    const timeToUse = timestamp || Date.now();
    const elapsed = timeToUse - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const milliseconds = elapsed % 1000;
    return `${seconds.toString().padStart(3, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Closes the log file and cleans up resources.
   */
  close(): void {
    // Flush any remaining buffered data
    this.flushBuffer();

    this.logData.metadata.endTime = new Date().toISOString();
    this.writeLogFile();
  }

  /**
   * Gets the path to the log file.
   *
   * @returns The log file path
   */
  getLogFilePath(): string {
    return this.logFile;
  }

  /**
   * Converts a number array (from JSON) back to a Uint8Array.
   * This is the reverse of Array.from(uint8Array) used when storing data.
   *
   * @param data - Array of numbers (0-255) representing raw byte values
   * @returns Uint8Array representation of the data
   */
  static dataToUint8Array(data: number[]): Uint8Array {
    return new Uint8Array(data);
  }

  /**
   * Converts a number array (from JSON) to a hex string for display.
   *
   * @param data - Array of numbers (0-255) representing raw byte values
   * @returns Hex string representation of the data (e.g., "AA BB CC DD")
   */
  static dataToHexString(data: number[]): string {
    return toHexWords(new Uint8Array(data));
  }
}

/**
 * Creates a logging wrapper around a SerialPort instance.
 *
 * This function returns a SerialPort-like object that logs all read/write
 * operations while maintaining the same interface as the original SerialPort.
 *
 * @param port - The original SerialPort instance
 * @param serialLogger - The SerialLogger instance to use for logging
 * @returns A SerialPort-like object with logging capabilities
 */
export function createLoggingSerialPort(port: SerialPort, serialLogger: SerialLogger): SerialPort {
  // Create a proxy that intercepts write operations
  const originalWrite = port.write.bind(port);

  // Override the write method to log data
  port.write = function (data: any, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean {
    if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
      serialLogger.logSend(new Uint8Array(data));
    } else if (typeof data === 'string') {
      serialLogger.logSend(new Uint8Array(Buffer.from(data)));
    } else if (Array.isArray(data)) {
      serialLogger.logSend(new Uint8Array(data));
    }

    // Handle both overloads: (data, callback) and (data, encoding, callback)
    if (typeof encodingOrCallback === 'function') {
      return originalWrite(data, encodingOrCallback);
    } else {
      return originalWrite(data, encodingOrCallback, callback);
    }
  };

  // Set up data logging for received data
  port.on('data', (data: Buffer) => {
    serialLogger.logReceive(new Uint8Array(data));
  });

  return port;
}
