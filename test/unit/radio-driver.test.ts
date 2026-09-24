import { describe, expect, it } from 'vitest';
import type { RadioProgressIndicator, Radio } from '@springfield/ham-radio-api';
import { RadioDriver, CancelledException } from '../../src/index.js';
import { RadioModelId } from '@springfield/ham-radio-api';
import { MockLogLayer } from 'loglayer';

describe('RadioDriver', () => {
  const mockLogger = new MockLogLayer();

  const mockRadio: Radio = {
    id: {
      model: RadioModelId('test-radio'),
      name: 'Test Radio',
      manufacturer: 'Test Manufacturer',
    },
    version: '1.0.0',
    description: 'Test radio configuration for unit tests',
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
      addressSize: 2,
      addressEndianness: 'big',
      segments: {
        channels: {
          startAddress: 0,
          endAddress: 100,
        },
      },
    },
    readMemory: [
      {
        description: 'Test step',
        send: [0x01],
        expect: 0x06,
      },
    ],
    writeMemory: [
      {
        description: 'Test write step',
        send: [0x02],
        expect: 0x06,
      },
    ],
  };

  const progressIndicator: RadioProgressIndicator = {
    setValue: (value: number) => {
      expect(value).toBeTypeOf('number');
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    },
    isCanceled: false,
  };

  describe('readRadio()', () => {
    it('should require progress indicator parameter', async () => {
      const driver = new RadioDriver(mockRadio, mockLogger);
      expect(driver.readRadio).toBeTypeOf('function');
      const method = driver.readRadio.bind(driver);
      expect(method.length).toBe(2); // serialPortPath, progressIndicator
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
      expect(driver.writeRadio).toBeTypeOf('function');
      const method = driver.writeRadio.bind(driver);
      expect(method.length).toBe(3); // serialPortPath, data, progressIndicator
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
      expect(CancelledException).toBeTypeOf('function');
      const exception = new CancelledException('Test cancellation');
      expect(exception).toBeInstanceOf(Error);
      expect(exception).toBeInstanceOf(CancelledException);
      expect(exception.name).toBe('CancelledException');
      expect(exception.message).toBe('Test cancellation');
    });

    it('should have a default message when none provided', () => {
      const exception = new CancelledException();
      expect(exception.message).toBe('Operation was cancelled');
    });
  });
});
