import { describe, it, beforeEach } from 'node:test';
import { expect } from 'chai';
import type { RadioProgressIndicator, Radio } from '@springfield/ham-radio-api';
import { RadioDriver } from '../../src/index.js';
import { RadioModelId } from '@springfield/ham-radio-api';
import { MockLogLayer } from 'loglayer';
import { EventEmitter } from 'events';
import { ByteLengthParser } from '@serialport/parser-byte-length';
import type { SerialPort } from 'serialport';

// Mock SerialPort class
class MockSerialPort extends EventEmitter {
  public isOpen = false;
  private parser: ByteLengthParser | null = null;
  private writeBuffer: Buffer[] = [];
  private pendingResponses: (() => void)[] = [];
  private currentOperation: 'read' | 'write' | null = null; // Track current operation type

  constructor() {
    super();
    // Simulate port opening
    setImmediate(() => {
      this.isOpen = true;
      this.emit('open');
    });
  }

  pipe(parser: ByteLengthParser): ByteLengthParser {
    this.parser = parser;
    // Send any pending responses now that parser is set up
    this.sendPendingResponses();
    return parser;
  }

  unpipe(): void {
    this.parser = null;
  }

  write(data: Buffer | number[] | string): boolean {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.writeBuffer.push(buffer);

    // Debug logging
    console.log(`MockSerialPort.write: ${buffer.toString('hex')} (${buffer.length} bytes)`);

    // Simulate radio responses based on the protocol
    this.simulateRadioResponse(buffer);

    return true;
  }

  close(): void {
    this.isOpen = false;
    this.emit('close');
  }

  private simulateRadioResponse(data: Buffer): void {
    const response = this.createResponse(data);
    if (response) {
      this.queueResponse(response);
    }
  }

  private createResponse(sentData: Buffer): Buffer | null {
    // Simulate responses based on the baofeng-uv5r protocol
    if (this.isMagicNumber(sentData)) {
      return Buffer.from([0x06]); // Acknowledgment
    } else if (this.isGetIdentifier(sentData)) {
      return Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]); // Radio identifier
    } else if (this.isBeginClone(sentData)) {
      return Buffer.from([0x06]); // Acknowledgment
    } else if (this.isStartChunk(sentData)) {
      if (this.currentOperation === 'write') {
        // For write operations, respond with acknowledgment
        return Buffer.from([0x06]);
      } else {
        // For read operations, respond with chunk data
        const address = (sentData[0] << 8) | sentData[1];
        const chunkSize = sentData[2];
        const response = Buffer.alloc(4 + chunkSize);
        response[0] = 0x58; // 'X'
        response[1] = (address >> 8) & 0xFF;
        response[2] = address & 0xFF;
        response[3] = chunkSize;
        // Fill with mock data
        for (let i = 0; i < chunkSize; i++) {
          response[4 + i] = (address + i) & 0xFF;
        }
        return response;
      }
    } else if (this.isEndChunk(sentData)) {
      // End chunk response: 0x06
      return Buffer.from([0x06]);
    } else if (this.isWriteSegment(sentData)) {
      // Write segment operations always expect acknowledgment
      return Buffer.from([0x06]);
    }

    return null;
  }

  private queueResponse(response: Buffer): void {
    const sendResponse = () => {
      if (this.parser) {
        console.log(`MockSerialPort sending response: ${response.toString('hex')} (${response.length} bytes)`);
        this.parser.emit('data', response);
      } else {
        console.log(`MockSerialPort: no parser available, queuing response`);
      }
    };

    // If parser is already set up, send immediately, otherwise queue
    if (this.parser) {
      setImmediate(sendResponse);
    } else {
      this.pendingResponses.push(sendResponse);
    }
  }

  private sendPendingResponses(): void {
    console.log(`MockSerialPort: sending ${this.pendingResponses.length} pending responses`);
    while (this.pendingResponses.length > 0) {
      const sendResponse = this.pendingResponses.shift();
      if (sendResponse) {
        setImmediate(sendResponse);
      }
    }
  }

  private isMagicNumber(data: Buffer): boolean {
    // Magic number: 50bbff20120725 (7 bytes)
    return (
      data.length === 7 &&
      data[0] === 0x50 &&
      data[1] === 0xbb &&
      data[2] === 0xff &&
      data[3] === 0x20 &&
      data[4] === 0x12 &&
      data[5] === 0x07 &&
      data[6] === 0x25
    );
  }

  private isGetIdentifier(data: Buffer): boolean {
    // Get identifier: 02 (1 byte)
    return data.length === 1 && data[0] === 0x02;
  }

  private isBeginClone(data: Buffer): boolean {
    // Begin clone: 06 (1 byte)
    return data.length === 1 && data[0] === 0x06;
  }

  private isStartChunk(data: Buffer): boolean {
    // Protocol sends: address (2 bytes) + chunkSize (1 byte) = 3 bytes
    // This is a read chunk request
    if (data.length === 3 && data[2] === 64) {
      this.currentOperation = 'read';
      return true;
    }
    return false;
  }

  private isEndChunk(data: Buffer): boolean {
    // End chunk: 06 (1 byte)
    return data.length === 1 && data[0] === 0x06;
  }

  private isWriteSegment(data: Buffer): boolean {
    // Protocol sends: address (2 bytes) + chunkSize (1 byte) = 3 bytes
    // This is a write chunk request
    if (data.length === 3 && data[2] === 64) {
      this.currentOperation = 'write';
      return true;
    }
    return false;
  }

  getWriteBuffer(): Buffer[] {
    return [...this.writeBuffer];
  }

  clearWriteBuffer(): void {
    this.writeBuffer = [];
  }

  // Method to set the current operation type
  setOperationType(operation: 'read' | 'write'): void {
    this.currentOperation = operation;
    console.log(`MockSerialPort: Operation type set to ${operation}`);
  }
}

// Test harness that extends RadioDriver with mock serial port
class TestableRadioDriver extends RadioDriver {
  private mockPortClass: typeof MockSerialPort;

  constructor(radio: Radio, logger: MockLogLayer, mockPortClass: typeof MockSerialPort = MockSerialPort) {
    super(radio, logger);
    this.mockPortClass = mockPortClass;
  }

  protected createSerialPort(): SerialPort {
    return new this.mockPortClass() as unknown as SerialPort;
  }
}

// Create baofeng-uv5r radio configuration from the JSON
const baofengUV5RRadio: Radio = {
  id: {
    model: RadioModelId('baofeng-uv5r'),
    name: 'Baofeng UV-5R',
    manufacturer: 'Baofeng',
  },
  settingsSchema: {
    model: RadioModelId('baofeng-uv5r'),
    settingsSchema: {},
    channelSchema: {},
  },
  serialConfig: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  },
  memoryConfig: {
    chunkSize: 64,
    segments: {
      channels: {
        startAddress: 0,
        endAddress: 6143,
      },
      settings: {
        startAddress: 7872,
        endAddress: 8191,
      },
    },
  },
  readMemory: [
    {
      sendReceive: {
        send: [80, 187, 255, 32, 18, 7, 37],
        receive: {
          type: 'exact',
          value: 6,
          length: 1,
        },
        description: 'Send magic number',
      },
    },
    {
      sendReceive: {
        send: [2],
        receive: {
          type: 'variable',
          length: 8,
        },
        description: 'Get radio identifier',
      },
    },
    {
      sendReceive: {
        send: [6],
        receive: {
          type: 'exact',
          value: 6,
          length: 1,
        },
        description: 'Begin clone operation',
      },
    },
    {
      readSegment: {
        segments: ['channels', 'settings'],
        startChunk: {
          send: ['S', 'address', 'segment.chunkSize'],
          receive: {
            type: 'pattern',
            pattern: [
              'X',
              {
                field: 'address',
                size: 2,
              },
              {
                field: 'length',
                size: 1,
              },
              {
                field: 'data',
                size: 0,
              },
            ],
          },
        },
        endChunk: {
          send: [6],
          receive: {
            type: 'exact',
            value: 6,
            length: 1,
          },
        },
        description: 'Read all memory segments',
      },
    },
  ],
  writeMemory: [
    {
      sendReceive: {
        send: [80, 187, 255, 32, 18, 7, 37],
        receive: {
          type: 'exact',
          value: 6,
          length: 1,
        },
        description: 'Send magic number',
      },
    },
    {
      writeSegment: {
        segments: ['channels', 'settings'],
        send: ['X', 'segment.startAddress', 'segment.chunkSize'],
        data: 'segment.data',
        receive: {
          type: 'exact',
          value: 6,
          length: 1,
        },
        description: 'Write all memory segments',
      },
    },
  ],
};

describe('RadioDriver Integration Tests', () => {
  let mockLogger: MockLogLayer;
  let progressIndicator: RadioProgressIndicator;

  beforeEach(() => {
    mockLogger = new MockLogLayer();
    progressIndicator = {
      setValue: (_value: number) => {
        // No-op for testing
      },
      isCanceled: false,
    };
  });

  describe('readRadio()', () => {
    it('should successfully read radio memory using baofeng-uv5r protocol', async () => {
      const mockPort = new MockSerialPort();
      mockPort.setOperationType('read'); // Set operation type for read test

      const driver = new TestableRadioDriver(baofengUV5RRadio, mockLogger, MockSerialPort);
      const serialPortPath = '/dev/ttyUSB0';

      const memoryData = await driver.readRadio(serialPortPath, progressIndicator);

      expect(memoryData).to.be.instanceOf(Uint8Array);
      expect(memoryData.length).to.be.greaterThan(0);
    });

    it('should handle cancellation during read operation', async () => {
      const mockPort = new MockSerialPort();
      mockPort.setOperationType('read');

      const driver = new TestableRadioDriver(baofengUV5RRadio, mockLogger, MockSerialPort);
      const serialPortPath = '/dev/ttyUSB0';

      // Cancel the operation after a short delay
      setTimeout(() => {
        progressIndicator.isCanceled = true;
      }, 10);

      try {
        await driver.readRadio(serialPortPath, progressIndicator);
        expect.fail('Should have thrown CancelledException');
      } catch (error: any) {
        expect(error.constructor.name).to.equal('CancelledException');
      }
    });
  });

  describe('RadioDriver utility methods', () => {
    it('should return correct number of memory segments', () => {
      const driver = new RadioDriver(baofengUV5RRadio, mockLogger);
      expect(driver.getNumberMemorySegments()).to.equal(2);
    });

    it('should return correct radio model', () => {
      const driver = new RadioDriver(baofengUV5RRadio, mockLogger);
      expect(driver.getRadioModel()).to.equal('baofeng-uv5r');
    });
  });
});
