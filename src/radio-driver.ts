import type { Radio, RadioProgressIndicator } from '@springfield/ham-radio-api';
import type { ILogLayer } from 'loglayer';
import { ProtocolInterpreter } from './protocol-interpreter.js';
import { SerialPort } from 'serialport';
import type { UILogger } from '@springfield/ham-radio-utils';

/**
 * RadioDriver provides high-level operations for reading and writing radio memory
 * using a DSL-based protocol specification. It handles serial communication,
 * protocol interpretation, and memory operations for supported radio models.
 *
 * The driver abstracts the complexity of radio-specific communication protocols
 * and provides a unified interface for memory operations across different radio
 * models. It uses the ProtocolInterpreter to execute protocol steps defined
 * in the radio configuration.
 *
 * @example
 * ```typescript
 * const radio = new RadioDriver(radioConfig, logger);
 *
 * // Read radio memory
 * const memoryData = await radio.readRadio('/dev/ttyUSB0', progressIndicator);
 *
 * // Write radio memory
 * await radio.writeRadio('/dev/ttyUSB0', memoryData, progressIndicator);
 * ```
 */
export class RadioDriver {
  private radio: Radio;
  private logger: ILogLayer;
  private uiLogger?: UILogger;

  /**
   * Creates a new RadioDriver instance for the specified radio model.
   *
   * @param radio - The radio configuration containing protocol definitions,
   *               memory layout, and serial communication settings
   * @param logger - Logger instance for debug and error logging
   * @param uiLogger - Optional UI logger instance for command-level logging
   *                  for display in user interfaces
   *
   * @example
   * ```typescript
   * const driver = new RadioDriver(baofengUV5RConfig, logger);
   *
   * // With UI logger for UI display
   * const uiLogger = createUILogger();
   * const driver = new RadioDriver(baofengUV5RConfig, logger, uiLogger);
   * ```
   */
  constructor(radio: Radio, logger: ILogLayer, uiLogger?: UILogger) {
    this.radio = radio;
    this.logger = logger;
    this.uiLogger = uiLogger;
  }

  /**
   * Reads the complete radio memory using the DSL protocol specification.
   *
   * This method establishes a serial connection to the radio, executes the
   * readMemory protocol steps, and returns the complete memory contents as
   * a Uint8Array. The method handles connection lifecycle and error recovery.
   *
   * @param serialPortPath - Path to the serial port (e.g., '/dev/ttyUSB0' on Linux,
   *                        'COM3' on Windows, '/dev/tty.usbserial-*' on macOS)
   * @param progressIndicator - Progress indicator for cancellation support and
   *                           operation progress reporting
   * @returns Promise that resolves to a Uint8Array containing the complete
   *          radio memory data
   *
   * @throws {Error} When serial port connection fails
   * @throws {Error} When protocol execution fails
   * @throws {CancelledException} When the operation is cancelled via the progress indicator
   *
   * @example
   * ```typescript
   * const progressIndicator = new RadioProgressIndicator();
   *
   * try {
   *   const memoryData = await radioDriver.readRadio('/dev/ttyUSB0', progressIndicator);
   *   console.log(`Read ${memoryData.length} bytes of memory data`);
   * } catch (error) {
   *   console.error('Failed to read radio memory:', error);
   * }
   * ```
   */
  async readRadio(serialPortPath: string, progressIndicator: RadioProgressIndicator): Promise<Uint8Array> {
    let port: SerialPort | undefined = undefined;

    try {
      this.logger.debug(`Connecting to serial port: '${serialPortPath}'`);
      port = await this.connectToRadio(serialPortPath);

      this.logger.debug('Starting radio memory read');
      const buffer = await this.readRadioMemory(port, progressIndicator);
      this.logger.debug('Radio memory read completed');
      return buffer;
    } finally {
      if (port && port.isOpen) {
        this.logger.withMetadata({ serialPortPath }).debug('Closing serial port');
        port.close();
      }
    }
  }

  /**
   * Writes data to the radio memory using the DSL protocol specification.
   *
   * This method establishes a serial connection to the radio and executes
   * the writeMemory protocol steps to write the provided data to the radio's
   * memory. The method handles connection lifecycle and error recovery.
   *
   * @param serialPortPath - Path to the serial port (e.g., '/dev/ttyUSB0' on Linux,
   *                        'COM3' on Windows, '/dev/tty.usbserial-*' on macOS)
   * @param data - Uint8Array containing the radio memory data to write
   * @param progressIndicator - Progress indicator for cancellation support and
   *                           operation progress reporting
   *
   * @throws {Error} When serial port connection fails
   * @throws {Error} When protocol execution fails
   * @throws {Error} When data size doesn't match expected memory size
   * @throws {CancelledException} When the operation is cancelled via the progress indicator
   *
   * @example
   * ```typescript
   * const progressIndicator = new RadioProgressIndicator();
   * const memoryData = new Uint8Array(/* memory data *\/);
   *
   * try {
   *   await radioDriver.writeRadio('/dev/ttyUSB0', memoryData, progressIndicator);
   *   console.log('Radio memory write completed successfully');
   * } catch (error) {
   *   console.error('Failed to write radio memory:', error);
   * }
   * ```
   */
  async writeRadio(serialPortPath: string, data: Uint8Array, progressIndicator: RadioProgressIndicator): Promise<void> {
    let port: SerialPort | undefined = undefined;

    try {
      this.logger.debug(`Connecting to serial port: '${serialPortPath}'`);
      port = await this.connectToRadio(serialPortPath);

      this.logger.debug('Starting radio memory write');
      await this.writeRadioMemory(port, data, progressIndicator);
      this.logger.debug('Radio memory write completed');
    } finally {
      if (port && port.isOpen) {
        this.logger.withMetadata({ serialPortPath }).debug('Closing serial port');
        port.close();
      }
    }
  }

  /**
   * Establishes a serial connection to the radio using the configuration
   * specified in the radio model.
   *
   * This method creates a SerialPort instance with the baud rate, data bits,
   * stop bits, and parity settings defined in the radio's serialConfig.
   * It returns a Promise that resolves when the port is successfully opened
   * or rejects if an error occurs during connection.
   *
   * @param serialPortPath - Path to the serial port device
   * @returns Promise that resolves to an opened SerialPort instance
   *
   * @throws {Error} When the serial port cannot be opened or configured
   *
   * @example
   * ```typescript
   * const port = await this.connectToRadio('/dev/ttyUSB0');
   * // port is now ready for communication
   * ```
   */
  private async connectToRadio(serialPortPath: string): Promise<SerialPort> {
    const { baudRate, dataBits = 8, stopBits = 1, parity = 'none' } = this.radio.serialConfig;

    const port = this.createSerialPort({
      baudRate,
      dataBits,
      parity,
      path: serialPortPath,
      stopBits,
    });

    return new Promise((resolve, reject) => {
      port.on('open', () => {
        this.logger.debug('Serial port opened successfully');
        resolve(port);
      });

      port.on('error', (error: Error) => {
        this.logger.withError(error).debug('Serial port error');
        reject(error);
      });
    });
  }

  /**
   * Creates a SerialPort instance. This method can be overridden in tests
   * to provide mock implementations.
   *
   * @param options - SerialPort configuration options
   * @returns A new SerialPort instance
   */
  protected createSerialPort(options: any): SerialPort {
    return new SerialPort(options);
  }

  /**
   * Reads radio memory by executing the readMemory protocol steps.
   *
   * This method calculates the total memory size from the radio's memory
   * configuration, creates a buffer to hold the data, and uses the
   * ProtocolInterpreter to execute the readMemory protocol. The protocol
   * steps are defined in the radio configuration and handle the specific
   * communication sequence required for the radio model.
   *
   * @param port - Open SerialPort instance for communication
   * @param progressIndicator - Progress indicator for cancellation and progress reporting
   * @returns Promise that resolves to a Uint8Array containing the complete memory data
   *
   * @throws {Error} When protocol execution fails
   * @throws {CancelledException} When the operation is cancelled
   *
   * @example
   * ```typescript
   * const memoryData = await this.readRadioMemory(port, progressIndicator);
   * // memoryData contains the complete radio memory
   * ```
   */
  private async readRadioMemory(port: SerialPort, progressIndicator: RadioProgressIndicator): Promise<Uint8Array> {
    // Calculate total memory size from memoryConfig
    const totalSize = Object.values(this.radio.memoryConfig.segments).reduce((sum: number, seg) => sum + (seg.endAddress - seg.startAddress + 1), 0);
    const buffer = new Uint8Array(totalSize);

    const context = {
      bufferOffset: 0,
      logger: this.logger,
      memoryBuffer: buffer,
      memoryConfig: this.radio.memoryConfig,
      port,
      variables: new Map<string, any>(),
      progressIndicator,
      uiLogger: this.uiLogger,
    };

    const interpreter = new ProtocolInterpreter(context);
    await interpreter.executeProtocol(this.radio, 'readMemory', buffer);
    return buffer;
  }

  /**
   * Writes radio memory by executing the writeMemory protocol steps.
   *
   * This method uses the ProtocolInterpreter to execute the writeMemory
   * protocol defined in the radio configuration. The protocol handles
   * the specific communication sequence required to write data to the
   * radio's memory, including any necessary handshaking and verification.
   *
   * @param port - Open SerialPort instance for communication
   * @param data - Uint8Array containing the memory data to write
   * @param progressIndicator - Progress indicator for cancellation and progress reporting
   *
   * @throws {Error} When protocol execution fails
   * @throws {Error} When data size doesn't match expected memory size
   * @throws {CancelledException} When the operation is cancelled
   *
   * @example
   * ```typescript
   * await this.writeRadioMemory(port, memoryData, progressIndicator);
   * // Memory write operation completed
   * ```
   */
  private async writeRadioMemory(port: SerialPort, data: Uint8Array, progressIndicator: RadioProgressIndicator): Promise<void> {
    const context = {
      bufferOffset: 0,
      logger: this.logger,
      memoryBuffer: data,
      memoryConfig: this.radio.memoryConfig,
      port,
      variables: new Map<string, any>(),
      progressIndicator,
      uiLogger: this.uiLogger,
    };

    const interpreter = new ProtocolInterpreter(context);
    await interpreter.executeProtocol(this.radio, 'writeMemory', data);
  }

  /**
   * Gets the total number of memory segments defined in the radio configuration.
   *
   * Memory segments represent different areas of the radio's memory that
   * may have different purposes (e.g., channels, settings, calibration data).
   * This method provides information about the memory layout structure.
   *
   * @returns The number of memory segments defined in the radio configuration
   *
   * @example
   * ```typescript
   * const segmentCount = radioDriver.getNumberMemorySegments();
   * console.log(`Radio has ${segmentCount} memory segments`);
   * ```
   */
  getNumberMemorySegments(): number {
    return Object.keys(this.radio.memoryConfig.segments).length;
  }

  /**
   * Gets the radio model name from the radio configuration.
   *
   * This method returns the model identifier for the radio, which is useful
   * for logging, error reporting, and determining radio-specific behavior.
   *
   * @returns The radio model name as a string
   *
   * @example
   * ```typescript
   * const model = radioDriver.getRadioModel();
   * console.log(`Connected to radio model: ${model}`);
   * ```
   */
  getRadioModel(): string {
    return this.radio.id.model;
  }
}
