import { describe, it } from 'node:test';
import { expect } from 'chai';
import type { RadioProgressIndicator, Radio } from '@springfield/ham-radio-api';
import { RadioDriver, CancelledException } from '../../src/index.js';
import { RadioModelId } from '@springfield/ham-radio-api';

describe('RadioDriver', () => {
  const mockLogger = {
    debug: () => {},
    withMetadata: () => mockLogger,
    withError: () => mockLogger,
  } as any; // Use any to avoid interface complexity for testing

  const mockRadio: Radio = {
    id: {
      model: RadioModelId('test-radio'),
      name: 'Test Radio',
      manufacturer: 'Test Manufacturer',
    },
    settingsSchema: {
      model: RadioModelId('test-radio'),
      settingsSchema: {},
      channelSchema: {},
    },
    serialConfig: {
      baudRate: 9600,
    },
    memoryConfig: {
      chunkSize: 16,
      segments: {
        channels: {
          startAddress: 0,
          endAddress: 100,
        },
      },
    },
    readMemory: [
      {
        sendReceive: {
          send: [0x01],
          receive: { type: 'exact', value: 0x06, length: 1 },
          description: 'Test step',
        },
      },
    ],
    writeMemory: [
      {
        sendReceive: {
          send: [0x02],
          receive: { type: 'exact', value: 0x06, length: 1 },
          description: 'Test write step',
        },
      },
    ],
  };

  const progressIndicator: RadioProgressIndicator = {
    setValue: (value: number) => {
      expect(value).to.be.a('number');
      expect(value).to.be.at.least(0);
      expect(value).to.be.at.most(1);
    },
    isCanceled: false,
  };

  describe('readRadio()', () => {
    it('should require progress indicator parameter', async () => {
      const driver = new RadioDriver(mockRadio, mockLogger);
      expect(driver.readRadio).to.be.a('function');
      const method = driver.readRadio.bind(driver);
      expect(method.length).to.equal(2); // serialPortPath, progressIndicator
      // Should not throw when called with progressIndicator (connection will fail, but that's fine for this test)
      try {
        await driver.readRadio('dummy', progressIndicator);
      } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Expected: no serial port
      }
    });
  });

  describe('writeRadio()', () => {
    it('should require progress indicator parameter', async () => {
      const driver = new RadioDriver(mockRadio, mockLogger);
      expect(driver.writeRadio).to.be.a('function');
      const method = driver.writeRadio.bind(driver);
      expect(method.length).to.equal(3); // serialPortPath, data, progressIndicator
      const testData = new Uint8Array([1, 2, 3, 4]);
      // Should not throw when called with progressIndicator (connection will fail, but that's fine for this test)
      try {
        await driver.writeRadio('dummy', testData, progressIndicator);
      } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Expected: no serial port
      }
    });
  });

  describe('CancelledException', () => {
    it('should be properly exported and instantiable', () => {
      expect(CancelledException).to.be.a('function');
      const exception = new CancelledException('Test cancellation');
      expect(exception).to.be.instanceOf(Error);
      expect(exception).to.be.instanceOf(CancelledException);
      expect(exception.name).to.equal('CancelledException');
      expect(exception.message).to.equal('Test cancellation');
    });

    it('should have a default message when none provided', () => {
      const exception = new CancelledException();
      expect(exception.message).to.equal('Operation was cancelled');
    });
  });
});
