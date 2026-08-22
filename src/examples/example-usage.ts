import type { ILogLayer } from 'loglayer';
import { RadioDriver } from '../radio-driver.js';
import type { Radio } from '@springfield/ham-radio-api';
import { RadioModelId } from '@springfield/ham-radio-api';

// Example Baofeng UV-5R radio configuration
const baofengRadio: Radio = {
  id: {
    model: RadioModelId('baofeng-uv5r'),
    name: 'Baofeng UV-5R',
    manufacturer: 'Baofeng',
  },
  version: '1.0.0',
  description: 'Baofeng UV-5R radio configuration for memory read/write operations',
  settingsSchema: {
    model: RadioModelId('baofeng-uv5r'),
    settingsSchema: {},
    channelSchema: {},
  },
  memoryConfig: {
    chunkSize: 64,
    addressSize: 2,
    addressEndianness: 'big',
    segments: {
      channels: {
        endAddress: 6143,
        startAddress: 0,
      },
      settings: {
        endAddress: 8191,
        startAddress: 7872,
      },
    },
  },
  serialConfig: {
    baudRate: 9600,
    dataBits: 8,
    parity: 'none',
    stopBits: 1,
  },
  readMemory: [
    {
      description: 'Send magic number',
      send: ['0x50', '0xBB', '0xFF', '0x20', '0x12', '0x07', '0x25'],
      expect: '0x06',
    },
    {
      description: 'Get radio identifier',
      send: ['0x02'],
      expect: { bytes: 8 },
    },
    {
      description: 'Begin clone operation',
      send: ['0x06'],
      expect: '0x06',
    },
    {
      description: 'Read memory',
      read: {
        segments: ['channels', 'settings'],
        send: ['S', '$address', '$chunkSize'],
        expect: ['X', '$address', '$length', '$data'],
        ack: {
          send: ['0x06'],
          expect: '0x06',
        },
      },
    },
  ],
  writeMemory: [
    {
      description: 'Send magic number',
      send: ['0x50', '0xBB', '0xFF', '0x20', '0x12', '0x07', '0x25'],
      expect: '0x06',
    },
    {
      description: 'Write memory',
      write: {
        segments: ['channels', 'settings'],
        send: ['X', '$address', '$chunkSize', '$data'],
        expect: '0x06',
      },
    },
  ],
};

/**
 * Example usage of the DSL-based RadioDriver
 */
export const exampleUsage = async (logger: ILogLayer, serialPortPath: string) => {
  try {
    // Create radio driver with radio configuration
    const radioDriver = new RadioDriver(baofengRadio, logger);

    logger.debug(`Using radio model: ${radioDriver.getRadioModel()}`);
    logger.debug(`Number of memory segments: ${radioDriver.getNumberMemorySegments()}`);

    // Create a simple progress indicator for the example
    const progressIndicator = {
      setValue: (value: number) => {
        logger.debug(`Progress: ${Math.round(value * 100)}%`);
      },
      isCanceled: false,
    };

    // Read radio memory
    logger.debug('Reading radio memory...');
    const memoryData = await radioDriver.readRadio(serialPortPath, progressIndicator);
    logger.debug(`Read ${memoryData.length} bytes of memory data`);

    // Example: Write the same data back to the radio
    logger.debug('Writing radio memory...');
    await radioDriver.writeRadio(serialPortPath, memoryData, progressIndicator);
    logger.debug('Radio memory write completed');

    return memoryData;
  } catch (error) {
    logger.withError(error).error('Error in radio operation');
    throw error;
  }
};

/**
 * Load radio from JSON file
 */
export const loadRadioFromFile = async (): Promise<Radio> => {
  // In a real implementation, you would load this from a file
  // For now, we'll return the hardcoded radio
  return baofengRadio;
};

/**
 * Create a radio driver from a radio file
 */
export const createRadioDriverFromFile = async (logger: ILogLayer): Promise<RadioDriver> => {
  const radio = await loadRadioFromFile();
  return new RadioDriver(radio, logger);
};
