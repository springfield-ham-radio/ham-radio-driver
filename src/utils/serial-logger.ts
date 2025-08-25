import { SerialPort } from 'serialport';
import type { ILogLayer } from 'loglayer';
import { toHexWords } from '@springfield/ham-radio-utils';
import * as fs from 'fs';

/**
 * SerialLogger provides logging capabilities for serial port communication
 * to enable easy comparison with sniffer output.
 *
 * This class wraps SerialPort instances and logs all read/write operations
 * in a standardized format that matches the sniffer output format.
 */
export class SerialLogger {
  private logger: ILogLayer;
  private logFile: string;
  private logStream: fs.WriteStream | null = null;
  private startTime: number;

  /**
   * Creates a new SerialLogger instance.
   *
   * @param logger - The loglayer logger instance for console logging
   * @param logFile - Optional path to the log file. If not provided, a timestamped file will be created
   */
  constructor(logger: ILogLayer, logFile?: string) {
    this.logger = logger;
    this.startTime = Date.now();

    if (logFile) {
      this.logFile = logFile;
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = `radio-driver-${timestamp}.log`;
    }

    this.initializeLogFile();
  }

  /**
   * Initializes the log file and writes the header.
   */
  private initializeLogFile(): void {
    try {
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.writeLogEntry('=== Radio Driver Serial Communication Log ===');
      this.writeLogEntry(`Started at: ${new Date().toISOString()}`);
      this.writeLogEntry('Format: [Timestamp] [Direction] [Data]');
      this.writeLogEntry('');
    } catch (error) {
      this.logger.withError(error).error('Failed to initialize log file');
    }
  }

  /**
   * Writes a log entry to both the file and console.
   *
   * @param message - The message to log
   */
  private writeLogEntry(message: string): void {
    if (this.logStream) {
      try {
        this.logStream.write(message + '\n');
      } catch (error) {
        this.logger.withError(error).error('Failed to write to log file');
      }
    }
    this.logger.debug(message);
  }

  /**
   * Logs data being sent to the radio.
   *
   * @param data - The data being sent
   * @param description - Optional description of the operation
   */
  logSend(data: Uint8Array, description?: string): void {
    const timestamp = this.getTimestamp();
    const hexData = toHexWords(data);
    const direction = 'SEND';

    let logMessage = `[${timestamp}] [${direction}] ${hexData}`;
    if (description) {
      logMessage += ` - ${description}`;
    }

    this.writeLogEntry(logMessage);
  }

  /**
   * Logs data being received from the radio.
   *
   * @param data - The data being received
   * @param description - Optional description of the operation
   */
  logReceive(data: Uint8Array, description?: string): void {
    const timestamp = this.getTimestamp();
    const hexData = toHexWords(data);
    const direction = 'RECV';

    let logMessage = `[${timestamp}] [${direction}] ${hexData}`;
    if (description) {
      logMessage += ` - ${description}`;
    }

    this.writeLogEntry(logMessage);
  }

  /**
   * Gets a formatted timestamp relative to the start time.
   *
   * @returns Formatted timestamp string
   */
  private getTimestamp(): string {
    const elapsed = Date.now() - this.startTime;
    const seconds = Math.floor(elapsed / 1000);
    const milliseconds = elapsed % 1000;
    return `${seconds.toString().padStart(3, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Closes the log file and cleans up resources.
   */
  close(): void {
    if (this.logStream) {
      this.writeLogEntry('');
      this.writeLogEntry(`=== Log completed at: ${new Date().toISOString()} ===`);
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * Gets the path to the log file.
   *
   * @returns The log file path
   */
  getLogFilePath(): string {
    return this.logFile;
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
