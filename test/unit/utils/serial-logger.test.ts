import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from 'chai';
import * as fs from 'fs';
import { SerialPort } from 'serialport';
import { SerialLogger, createLoggingSerialPort } from '../../../src/utils/serial-logger.js';
import { TempDir } from '../../utils/temp-dir.js';

describe('SerialLogger', () => {
  let tempDir: TempDir;
  let testLogFile: string;

  beforeEach(() => {
    tempDir = new TempDir();
    tempDir.create('serial-logger-test');
    testLogFile = tempDir.getFilePath('test.json');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('constructor', () => {
    it('should create logger with custom log file', async () => {
      const serialLogger = new SerialLogger(testLogFile);

      expect(serialLogger.getLogFilePath()).to.equal(testLogFile);

      // File should not exist until first log entry
      expect(fs.existsSync(testLogFile)).to.be.false;
    });

    it('should create logger with auto-generated log file', async () => {
      const serialLogger = new SerialLogger();

      const logPath = serialLogger.getLogFilePath();
      expect(logPath).to.match(/^radio-driver-.*\.json$/);

      // File should not exist until first log entry
      expect(fs.existsSync(logPath)).to.be.false;

      // Clean up the auto-generated log file
      serialLogger.close();
    });

    it('should initialize log file with header', async () => {
      const serialLogger = new SerialLogger(testLogFile);

      // Write some data to create the file
      serialLogger.logSend(new Uint8Array([0x01, 0x02]));

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);
      expect(logData.metadata).to.exist;
      expect(logData.metadata.startTime).to.exist;
      expect(logData.metadata.totalEntries).to.equal(1);
      expect(logData.metadata.version).to.equal('1.0.0');
      expect(logData.entries).to.be.an('array');
      expect(logData.entries).to.have.length(1);
    });

            it('should handle file creation errors gracefully', async () => {
      // Create a directory with the same name as the log file to cause an error
      fs.mkdirSync(testLogFile, { recursive: true });

      // Should not throw an error during construction
      const serialLogger = new SerialLogger(testLogFile);
      expect(serialLogger).to.be.instanceOf(SerialLogger);

      // The logger should still work for console logging even if file logging fails
      expect(() => serialLogger.logSend(new Uint8Array([0x01]))).to.not.throw();
      expect(() => serialLogger.logReceive(new Uint8Array([0x02]))).to.not.throw();

      // Clean up
      serialLogger.close();

      // Clean up the directory we created
      if (fs.existsSync(testLogFile)) {
        fs.rmSync(testLogFile, { recursive: true, force: true });
      }

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe('logSend', () => {
        it('should log sent data with timestamp and direction', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const testData = new Uint8Array([0x01, 0x02, 0x03]);

      serialLogger.logSend(testData);

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);

      expect(logData.entries).to.have.length(1);
      const entry = logData.entries[0];
      expect(entry.direction).to.equal('SEND');
      expect(entry.data).to.deep.equal([1, 2, 3]);
      expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
      expect(entry.elapsedMs).to.be.a('number');
    });

        it('should log sent data with description', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const testData = new Uint8Array([0x01, 0x02, 0x03]);
      const description = 'Test command';

      serialLogger.logSend(testData, description);

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);

      expect(logData.entries).to.have.length(1);
      const entry = logData.entries[0];
      expect(entry.direction).to.equal('SEND');
      expect(entry.data).to.deep.equal([1, 2, 3]);
      expect(entry.description).to.equal('Test command');
      expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
      expect(entry.elapsedMs).to.be.a('number');
    });

        it('should handle empty data', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const testData = new Uint8Array([]);

      serialLogger.logSend(testData);

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);

      expect(logData.entries).to.have.length(1);
      const entry = logData.entries[0];
      expect(entry.direction).to.equal('SEND');
      expect(entry.data).to.deep.equal([]);
      expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
      expect(entry.elapsedMs).to.be.a('number');
    });
  });

  describe('logReceive', () => {
        it('should log received data with timestamp and direction', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const testData = new Uint8Array([0x04, 0x05, 0x06]);

      serialLogger.logReceive(testData);

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);

      expect(logData.entries).to.have.length(1);
      const entry = logData.entries[0];
      expect(entry.direction).to.equal('RECV');
      expect(entry.data).to.deep.equal([4, 5, 6]);
      expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
      expect(entry.elapsedMs).to.be.a('number');
    });

        it('should log received data with description', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const testData = new Uint8Array([0x04, 0x05, 0x06]);
      const description = 'Response data';

      serialLogger.logReceive(testData, description);

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);

      expect(logData.entries).to.have.length(1);
      const entry = logData.entries[0];
      expect(entry.direction).to.equal('RECV');
      expect(entry.data).to.deep.equal([4, 5, 6]);
      expect(entry.description).to.equal('Response data');
      expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
      expect(entry.elapsedMs).to.be.a('number');
    });

    it('should handle empty received data', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const testData = new Uint8Array([]);

      serialLogger.logReceive(testData);

      // Close to write the file
      serialLogger.close();

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);

      expect(logData.entries).to.have.length(1);
      const entry = logData.entries[0];
      expect(entry.direction).to.equal('RECV');
      expect(entry.data).to.deep.equal([]);
      expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
      expect(entry.elapsedMs).to.be.a('number');
    });
  });

  describe('getTimestamp', () => {
                it('should return formatted timestamp', async () => {
      const serialLogger = new SerialLogger(testLogFile);

      // Wait a bit to ensure some time has passed
      await new Promise(resolve => setTimeout(resolve, 10));

      // Access the private method through the class for testing
      const timestamp = (serialLogger as any).getTimestamp();
      expect(timestamp).to.match(/^\d{3}\.\d{3}$/);

      // Clean up
      serialLogger.close();

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe('close', () => {
        it('should close log file and write completion message', async () => {
      const serialLogger = new SerialLogger(testLogFile);

      // Wait for logger initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      serialLogger.logSend(new Uint8Array([0x01]));
      serialLogger.close();

      // Wait for close to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const logData = JSON.parse(logContent);
      expect(logData.metadata.endTime).to.exist;
      expect(logData.metadata.totalEntries).to.equal(1);
    });

    it('should handle close when no log stream exists', async () => {
      const serialLogger = new SerialLogger(testLogFile);

      // Wait for logger initialization
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should not throw an error
      expect(() => serialLogger.close()).to.not.throw();

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe('getLogFilePath', () => {
                it('should return the log file path', async () => {
      const serialLogger = new SerialLogger(testLogFile);

      expect(serialLogger.getLogFilePath()).to.equal(testLogFile);

      // Clean up
      serialLogger.close();

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe('static methods', () => {
    describe('dataToUint8Array', () => {
      it('should convert number array to Uint8Array', () => {
        const data = [0x01, 0x02, 0x03, 0xFF];
        const result = SerialLogger.dataToUint8Array(data);

        expect(result).to.be.instanceOf(Uint8Array);
        expect(Array.from(result)).to.deep.equal([1, 2, 3, 255]);
      });

      it('should handle empty array', () => {
        const data: number[] = [];
        const result = SerialLogger.dataToUint8Array(data);

        expect(result).to.be.instanceOf(Uint8Array);
        expect(result.length).to.equal(0);
      });

      it('should handle single byte', () => {
        const data = [0xAA];
        const result = SerialLogger.dataToUint8Array(data);

        expect(result).to.be.instanceOf(Uint8Array);
        expect(Array.from(result)).to.deep.equal([170]);
      });
    });

    describe('dataToHexString', () => {
      it('should convert number array to hex string', () => {
        const data = [0x01, 0x02, 0x03, 0xFF];
        const result = SerialLogger.dataToHexString(data);

        expect(result).to.equal('0102 03ff');
      });

      it('should handle empty array', () => {
        const data: number[] = [];
        const result = SerialLogger.dataToHexString(data);

        expect(result).to.equal('');
      });

      it('should handle single byte', () => {
        const data = [0xAA];
        const result = SerialLogger.dataToHexString(data);

        expect(result).to.equal('aa');
      });

      it('should handle bytes with leading zeros', () => {
        const data = [0x00, 0x0A, 0x0F];
        const result = SerialLogger.dataToHexString(data);

        expect(result).to.equal('000a 0f');
      });
    });
  });
});

describe('createLoggingSerialPort', () => {
  let tempDir: TempDir;
  let testLogFile: string;
  let mockPort: any;

  beforeEach(() => {
    tempDir = new TempDir();
    tempDir.create('serial-logger-test');
    testLogFile = tempDir.getFilePath('test.json');

    // Create a mock SerialPort
    mockPort = {
      write: function(data: any, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean {
        if (typeof encodingOrCallback === 'function') {
          encodingOrCallback(null);
        } else if (callback) {
          callback(null);
        }
        return true;
      },
      on: function(event: string, handler: (data: Buffer) => void): void {
        // Store the handler for testing
        (mockPort as any).dataHandler = handler;
      },
    };
  });

  afterEach(() => {
    tempDir.cleanup();
  });

             it('should create logging wrapper around SerialPort', async () => {
      const serialLogger = new SerialLogger(testLogFile);
      const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);

      expect(loggingPort).to.equal(mockPort);

      // Clean up
      serialLogger.close();

      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });

          it('should log Uint8Array data sent through write method', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = new Uint8Array([0x01, 0x02, 0x03]);

    loggingPort.write(testData);

    // Close to write the file
    serialLogger.close();

    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const logData = JSON.parse(logContent);

    expect(logData.entries).to.have.length(1);
    const entry = logData.entries[0];
    expect(entry.direction).to.equal('SEND');
    expect(entry.data).to.deep.equal([1, 2, 3]);
    expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
    expect(entry.elapsedMs).to.be.a('number');
  });

      it('should log Buffer data sent through write method', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = Buffer.from([0x01, 0x02, 0x03]);

    loggingPort.write(testData);

    // Close to write the file
    serialLogger.close();

    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const logData = JSON.parse(logContent);

    expect(logData.entries).to.have.length(1);
    const entry = logData.entries[0];
    expect(entry.direction).to.equal('SEND');
    expect(entry.data).to.deep.equal([1, 2, 3]);
    expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
    expect(entry.elapsedMs).to.be.a('number');
  });

    it('should log string data sent through write method', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = 'Hello';

    loggingPort.write(testData);

    // Close to write the file
    serialLogger.close();

    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const logData = JSON.parse(logContent);

    expect(logData.entries).to.have.length(1);
    const entry = logData.entries[0];
    expect(entry.direction).to.equal('SEND');
    expect(entry.data).to.deep.equal([72, 101, 108, 108, 111]); // 'Hello' as byte values
    expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
    expect(entry.elapsedMs).to.be.a('number');
  });

    it('should log array data sent through write method', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = [0x01, 0x02, 0x03];

    loggingPort.write(testData);

    // Close to write the file
    serialLogger.close();

    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const logData = JSON.parse(logContent);

    expect(logData.entries).to.have.length(1);
    const entry = logData.entries[0];
    expect(entry.direction).to.equal('SEND');
    expect(entry.data).to.deep.equal([1, 2, 3]);
    expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
    expect(entry.elapsedMs).to.be.a('number');
  });

  it('should handle write method with callback', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = new Uint8Array([0x01, 0x02, 0x03]);
    let callbackCalled = false;

    const result = loggingPort.write(testData, (error) => {
      callbackCalled = true;
      expect(error).to.be.null;
    });

    expect(result).to.be.true;
    expect(callbackCalled).to.be.true;

    // Clean up
    serialLogger.close();

    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it('should handle write method with encoding and callback', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = new Uint8Array([0x01, 0x02, 0x03]);
    let callbackCalled = false;

    const result = loggingPort.write(testData, 'utf8', (error) => {
      callbackCalled = true;
      expect(error).to.be.null;
    });

    expect(result).to.be.true;
    expect(callbackCalled).to.be.true;

    // Clean up
    serialLogger.close();

    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });

    it('should log received data through data event', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = Buffer.from([0x04, 0x05, 0x06]);

    // Simulate data event
    (mockPort as any).dataHandler(testData);

    // Close to write the file
    serialLogger.close();

    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const logData = JSON.parse(logContent);

    expect(logData.entries).to.have.length(1);
    const entry = logData.entries[0];
    expect(entry.direction).to.equal('RECV');
    expect(entry.data).to.deep.equal([4, 5, 6]);
    expect(entry.timestamp).to.match(/^\d{3}\.\d{3}$/);
    expect(entry.elapsedMs).to.be.a('number');
  });

  it('should preserve original write method functionality', async () => {
    const serialLogger = new SerialLogger(testLogFile);
    const loggingPort = createLoggingSerialPort(mockPort as SerialPort, serialLogger);
    const testData = new Uint8Array([0x01, 0x02, 0x03]);

    // The mock write method returns true
    const result = loggingPort.write(testData);
    expect(result).to.be.true;

    // Clean up
    serialLogger.close();

    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });
});
