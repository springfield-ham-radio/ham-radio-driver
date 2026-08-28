import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from 'chai';
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

        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.true;
        expect(operation.handleDataCalled).to.be.true;
        expect(operation.sendDataCalled).to.be.true;
        expect(operation.handleErrorCalled).to.be.false;
        expect(result).to.deep.equal(new Uint8Array([0x01, 0x02, 0x03]));
      });

      it('should throw CancelledException when operation is cancelled', async () => {
        mockContext.progressIndicator!.isCanceled = true;
        const config = { test: true, timeout: 1000, expect: '0x06' };

        try {
          await operation.execute(config as any, mockContext);
          expect.fail('Should have thrown CancelledException');
        } catch (error) {
          expect(error).to.be.instanceOf(CancelledException);
        }
        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.false;
      });

      it('should throw error when configuration validation fails', async () => {
        const config = { timeout: 1000 };

        try {
          await operation.execute(config as any, mockContext);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal('Test configuration required');
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
          expect((error as Error).message).to.include('Timeout waiting for response');
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
        expect(() => operation['validateConfiguration']({ send: [0x01], expect: '0x06' })).to.not.throw();
        expect(() => operation['validateConfiguration']({ send: [0x01] })).to.not.throw();
        expect(() => operation['validateConfiguration']({ expect: '0x06' })).to.not.throw();
      });

      it('should throw when both send and expect are missing', () => {
        expect(() => operation['validateConfiguration']({})).to.throw('Exchange requires send, expect, and/or setBaudRate');
      });
    });

    describe('handleData()', () => {
      it('should validate and extract data for a valid ACK', () => {
        const result = operation['handleData'](Buffer.from([0x06]), { send: [0x01], expect: '0x06' }, mockContext);
        expect(result).to.deep.equal(new Uint8Array([0x06]));
      });

      it('should throw error for invalid response', () => {
        expect(() => operation['handleData'](Buffer.from([0x07]), { send: [0x01], expect: '0x06' }, mockContext)).to.throw('Invalid response pattern');
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
        expect(writtenData).to.deep.equal(new Uint8Array([1, 16, 0, 65]));
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

        expect(piped).to.have.length(1);
        expect(unpiped).to.deep.equal(piped);
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
          expect((error as Error).message).to.include('Timeout waiting for response');
        }

        expect(unpiped).to.have.length(1);
      });
    });
  });
});
