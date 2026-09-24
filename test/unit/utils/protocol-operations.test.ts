import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import { ProtocolOperationTemplate, SendReceiveOperation } from '@src/utils/protocol-operations.js';
import { CancelledException } from '@src/cancelled-exception.js';
import type { ProtocolContext } from '@src/protocol-context.js';
import { ProtocolContextFactory } from './test-factories.js';

class TestProtocolOperation extends ProtocolOperationTemplate {
  public validateConfigurationCalled = false;
  public setupParserCalled = false;
  public handleDataCalled = false;
  public handleErrorCalled = false;
  public sendDataCalled = false;

  public validateConfiguration(config: any): void {
    this.validateConfigurationCalled = true;
    if (!config.test) {
      throw new Error('Test configuration required');
    }
  }

  public setupParser(_config: any, _context: ProtocolContext): any {
    this.setupParserCalled = true;
    const parser = new EventEmitter();
    setTimeout(() => {
      parser.emit('data', Buffer.from([0x06, 0x01, 0x02, 0x03]));
    }, 10);
    return parser;
  }

  public handleData(data: Buffer, _config: any, _context: ProtocolContext): Uint8Array {
    this.handleDataCalled = true;
    return new Uint8Array(data.slice(1));
  }

  public handleError(_error: Error, _config: any): void {
    this.handleErrorCalled = true;
  }

  public sendData(_config: any, _context: ProtocolContext): void {
    this.sendDataCalled = true;
  }
}

describe('protocol-operations', () => {
  let mockContext: ProtocolContext;
  let mockPort: EventEmitter;

  beforeEach(() => {
    mockPort = new EventEmitter();
    mockContext = ProtocolContextFactory.build({
      port: mockPort as any
    });
  });

  afterEach(() => {
    mockPort.removeAllListeners();
  });

  describe('ProtocolOperationTemplate', () => {
    let operation: TestProtocolOperation;

    beforeEach(() => {
      operation = new TestProtocolOperation();
    });

    describe('execute()', () => {
      it('should execute successful operation', async () => {
        const config = { test: true, timeout: 1000, expect: '0x06' };
        const result = await operation.execute(config as any, mockContext);

        expect(operation.validateConfigurationCalled).toBe(true);
        expect(operation.setupParserCalled).toBe(true);
        expect(operation.handleDataCalled).toBe(true);
        expect(operation.sendDataCalled).toBe(true);
        expect(operation.handleErrorCalled).toBe(false);
        expect(result).toEqual(new Uint8Array([0x01, 0x02, 0x03]));
      });

      it('should throw CancelledException when operation is cancelled', async () => {
        mockContext.progressIndicator!.isCanceled = true;
        const config = { test: true, timeout: 1000, expect: '0x06' };

        try {
          await operation.execute(config as any, mockContext);
          expect.fail('Should have thrown CancelledException');
        } catch (error) {
          expect(error).toBeInstanceOf(CancelledException);
        }
        expect(operation.validateConfigurationCalled).toBe(true);
        expect(operation.setupParserCalled).toBe(false);
      });

      it('should throw error when configuration validation fails', async () => {
        const config = { timeout: 1000 };

        try {
          await operation.execute(config as any, mockContext);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Test configuration required');
        }
      });

      it('should timeout when no response is received', async () => {
        const config = { test: true, timeout: 50, expect: '0x06' };

        operation.setupParser = () => {
          operation.setupParserCalled = true;
          return new EventEmitter() as any;
        };

        try {
          await operation.execute(config as any, mockContext);
          expect.fail('Should have timed out');
        } catch (error) {
          expect((error as Error).message).toContain('Timeout waiting for response');
        }
      });
    });
  });

  describe('SendReceiveOperation', () => {
    let operation: SendReceiveOperation;

    beforeEach(() => {
      operation = new SendReceiveOperation();
      (mockContext.port as any).pipe = () => new EventEmitter();
    });

    describe('validateConfiguration()', () => {
      it('should accept send and/or expect', () => {
        expect(() => operation['validateConfiguration']({ send: [0x01], expect: '0x06' })).not.toThrow();
        expect(() => operation['validateConfiguration']({ send: [0x01] })).not.toThrow();
        expect(() => operation['validateConfiguration']({ expect: '0x06' })).not.toThrow();
      });

      it('should throw when both send and expect are missing', () => {
        expect(() => operation['validateConfiguration']({})).toThrow('Exchange requires send, expect, and/or setBaudRate');
      });
    });

    describe('handleData()', () => {
      it('should validate and extract data for a valid ACK', () => {
        const result = operation['handleData'](Buffer.from([0x06]), { send: [0x01], expect: '0x06' }, mockContext);
        expect(result).toEqual(new Uint8Array([0x06]));
      });

      it('should throw error for invalid response', () => {
        expect(() => operation['handleData'](Buffer.from([0x07]), { send: [0x01], expect: '0x06' }, mockContext)).toThrow('Invalid response pattern');
      });
    });

    describe('sendData()', () => {
      it('should resolve $address and ASCII opcodes', () => {
        mockContext.currentSegment = {
          name: 'test',
          config: { startAddress: 0, endAddress: 0 },
          currentAddress: 4096,
        };

        let writtenData: Uint8Array | null = null;
        (mockContext.port as any).write = (data: Uint8Array) => {
          writtenData = data;
        };

        operation['sendData']({ send: [0x01, '$address', 'A'], expect: '0x06' }, mockContext);
        expect(writtenData).toEqual(new Uint8Array([1, 16, 0, 65]));
      });
    });

    describe('parser lifecycle', () => {
      it('should unpipe the parser after a successful exchange', async () => {
        const piped: object[] = [];
        const unpiped: object[] = [];

        (mockContext.port as any).pipe = (destination: EventEmitter) => {
          piped.push(destination);
          setTimeout(() => {
            destination.emit('data', Buffer.from([0x06]));
          }, 5);
          return destination;
        };
        (mockContext.port as any).unpipe = (destination: object) => {
          unpiped.push(destination);
        };
        (mockContext.port as any).write = () => true;

        await operation.execute({ send: [0x06], expect: '0x06', timeout: 1000 }, mockContext);

        expect(piped).toHaveLength(1);
        expect(unpiped).toEqual(piped);
      });

      it('should unpipe the parser after a receive timeout', async () => {
        const unpiped: object[] = [];

        (mockContext.port as any).pipe = (destination: EventEmitter) => destination;
        (mockContext.port as any).unpipe = (destination: object) => {
          unpiped.push(destination);
        };
        (mockContext.port as any).write = () => true;

        try {
          await operation.execute({ send: [0x06], expect: '0x06', timeout: 20 }, mockContext);
          expect.fail('Should have timed out');
        } catch (error) {
          expect((error as Error).message).toContain('Timeout waiting for response');
        }

        expect(unpiped).toHaveLength(1);
      });

      it("reads until a CR delimiter and ignores line feeds", async () => {
        const operation = new SendReceiveOperation();
        (mockContext.port as any).write = () => true;

        const pending = operation.execute({ send: ["I", "D", "0x0D"], expect: { until: "0x0D" }, timeout: 200 }, mockContext);
        setImmediate(() => {
          mockPort.emit("data", Buffer.from("ID TH-F6A\r\n"));
        });

        const result = await pending;
        expect(Buffer.from(result).toString("ascii")).toBe("ID TH-F6A");
      });

      it("ignores empty CR wake echoes before the CAT reply", async () => {
        const operation = new SendReceiveOperation();
        (mockContext.port as any).write = () => true;

        const pending = operation.execute({ send: ["0x0D", "I", "D", "0x0D"], expect: { until: "0x0D" }, timeout: 200 }, mockContext);
        setImmediate(() => {
          mockPort.emit("data", Buffer.from("\rID TH-F6A\r"));
        });

        const result = await pending;
        expect(Buffer.from(result).toString("ascii")).toBe("ID TH-F6A");
      });
    });
  });
});
