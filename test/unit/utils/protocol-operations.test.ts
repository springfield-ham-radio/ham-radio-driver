import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from 'chai';
import { EventEmitter } from 'events';
import { ProtocolOperationTemplate, SendReceiveOperation } from '@src/utils/protocol-operations.js';
import { CancelledException } from '@src/cancelled-exception.js';
import type { ProtocolContext } from '@src/protocol-context.js';
import type { RadioReceivePattern } from '@springfield/ham-radio-api';
import { ProtocolContextFactory, Uint8ArrayFactory } from './test-factories.js';

// Mock implementation of ProtocolOperationTemplate for testing
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
    // Mock parser behavior
    setTimeout(() => {
      parser.emit('data', Buffer.from([0x06, 0x01, 0x02, 0x03]));
    }, 10);
    return parser;
  }

  public handleData(data: Buffer, _config: any, _context: ProtocolContext): Uint8Array {
    this.handleDataCalled = true;
    return new Uint8Array(data.slice(1)); // Remove first byte
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
    // Clean up any remaining listeners
    mockPort.removeAllListeners();
  });

  describe('ProtocolOperationTemplate', () => {
    let operation: TestProtocolOperation;

    beforeEach(() => {
      operation = new TestProtocolOperation();
    });

    describe('execute()', () => {
      it('should execute successful operation', async () => {
        const config = { test: true, timeout: 1000 };
        const result = await operation.execute(config, mockContext);

        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.true;
        expect(operation.handleDataCalled).to.be.true;
        expect(operation.sendDataCalled).to.be.true;
        expect(operation.handleErrorCalled).to.be.false;
        expect(result).to.deep.equal(new Uint8Array([0x01, 0x02, 0x03]));
      });

      it('should throw CancelledException when operation is cancelled', async () => {
        mockContext.progressIndicator!.isCanceled = true;
        const config = { test: true, timeout: 1000 };

        try {
          await operation.execute(config, mockContext);
          expect.fail('Should have thrown CancelledException');
        } catch (error) {
          expect(error).to.be.instanceOf(CancelledException);
        }
        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.false;
        expect(operation.handleDataCalled).to.be.false;
        expect(operation.sendDataCalled).to.be.false;
      });

      it('should throw error when configuration validation fails', async () => {
        const config = { timeout: 1000 }; // Missing test property

        try {
          await operation.execute(config, mockContext);
          expect.fail('Should have thrown error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal('Test configuration required');
        }
        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.false;
        expect(operation.handleDataCalled).to.be.false;
        expect(operation.sendDataCalled).to.be.false;
      });

      it('should timeout when no response is received', async () => {
        const config = { test: true, timeout: 50 };

        // Override setupParser to not emit data
        operation.setupParser = () => {
          operation.setupParserCalled = true;
          return new EventEmitter();
        };

        try {
          await operation.execute(config, mockContext);
          expect.fail('Should have thrown timeout error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.include('Timeout waiting for response');
        }
        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.true;
        expect(operation.handleDataCalled).to.be.false;
        expect(operation.sendDataCalled).to.be.true;
      });

      it('should handle parser errors', async () => {
        const config = { test: true, timeout: 1000 };

        // Override setupParser to emit error
        operation.setupParser = () => {
          operation.setupParserCalled = true;
          const parser = new EventEmitter();
          setTimeout(() => {
            parser.emit('error', new Error('Parser error'));
          }, 10);
          return parser;
        };

        try {
          await operation.execute(config, mockContext);
          expect.fail('Should have thrown parser error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal('Parser error');
        }
        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.true;
        expect(operation.handleDataCalled).to.be.false;
        expect(operation.sendDataCalled).to.be.true;
        expect(operation.handleErrorCalled).to.be.true;
      });

      it('should use default timeout when not specified', async () => {
        const config = { test: true }; // No timeout specified

        // Override setupParser to not emit data
        operation.setupParser = () => {
          operation.setupParserCalled = true;
          return new EventEmitter();
        };

        try {
          await operation.execute(config, mockContext);
          expect.fail('Should have thrown timeout error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.include('Timeout waiting for response');
        }
        expect(operation.sendDataCalled).to.be.true;
      });

      it('should handle data processing errors', async () => {
        const config = { test: true, timeout: 1000 };

        // Override handleData to throw error
        operation.handleData = () => {
          operation.handleDataCalled = true;
          throw new Error('Data processing error');
        };

        try {
          await operation.execute(config, mockContext);
          expect.fail('Should have thrown data processing error');
        } catch (error) {
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.equal('Data processing error');
        }
        expect(operation.validateConfigurationCalled).to.be.true;
        expect(operation.setupParserCalled).to.be.true;
        expect(operation.handleDataCalled).to.be.true;
        expect(operation.sendDataCalled).to.be.true;
      });
    });
  });

  describe('SendReceiveOperation', () => {
    let operation: SendReceiveOperation;

    beforeEach(() => {
      operation = new SendReceiveOperation();
      // Mock the port.pipe method
      (mockContext.port as any).pipe = () => new EventEmitter();
    });

    describe('validateConfiguration()', () => {
      it('should accept valid configuration with send and receive', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        expect(() => operation['validateConfiguration'](config)).to.not.throw();
      });

      it('should throw error when send configuration is missing', () => {
        const config = {
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        expect(() => operation['validateConfiguration'](config)).to.throw('SendReceive operation requires both send and receive configuration');
      });

      it('should throw error when receive configuration is missing', () => {
        const config = {
          send: [0x01, 0x02, 0x03]
        };

        expect(() => operation['validateConfiguration'](config)).to.throw('SendReceive operation requires both send and receive configuration');
      });

      it('should throw error when both send and receive are missing', () => {
        const config = {};

        expect(() => operation['validateConfiguration'](config)).to.throw('SendReceive operation requires both send and receive configuration');
      });
    });

    describe('setupParser()', () => {
      it('should create ByteLengthParser with expected length', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        const parser = operation['setupParser'](config, mockContext);
        expect(parser).to.be.instanceOf(EventEmitter);
        // Note: We can't easily test the ByteLengthParser internals without mocking
      });

      it('should handle different receive pattern types', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'variable', length: 64 } as RadioReceivePattern
        };

        const parser = operation['setupParser'](config, mockContext);
        expect(parser).to.be.instanceOf(EventEmitter);
      });
    });

    describe('handleData()', () => {
      it('should validate and extract data for valid response', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        const data = Buffer.from([0x06, 0x01, 0x02, 0x03]);
        const result = operation['handleData'](data, config, mockContext);

        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });

      it('should throw error for invalid response pattern', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        const data = Buffer.from([0x07, 0x01, 0x02, 0x03]); // Wrong first byte

        expect(() => operation['handleData'](data, config, mockContext)).to.throw('Invalid response pattern');
      });
    });

    describe('handleError()', () => {
      it('should not throw when called', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        expect(() => operation['handleError'](new Error('Test error'), config)).to.not.throw();
      });
    });

    describe('sendData()', () => {
      it('should resolve expressions and write to port', () => {
        const config = {
          send: [0x01, 'address', "'A'"],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        let writtenData: any = null;
        (mockContext.port as any).write = (data: any) => {
          writtenData = data;
        };

        operation['sendData'](config, mockContext);

        expect(writtenData).to.deep.equal([1, 0x1000, 65]);
      });

      it('should handle simple numeric data', () => {
        const config = {
          send: [0x01, 0x02, 0x03],
          receive: { type: 'exact', value: 0x06 } as RadioReceivePattern
        };

        let writtenData: any = null;
        (mockContext.port as any).write = (data: any) => {
          writtenData = data;
        };

        operation['sendData'](config, mockContext);

        expect(writtenData).to.deep.equal([1, 2, 3]);
      });
    });
  });
});
