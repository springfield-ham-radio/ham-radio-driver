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
  settingsSchema: {
    model: RadioModelId('baofeng-uv5r'),
    settingsSchema: {},
    channelSchema: {},
  },
  memoryConfig: {
    chunkSize: 64,
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
      sendReceive: {
        description: 'Send magic number',
        receive: {
          length: 1,
          type: 'exact',
          value: 0x06,
        },
        send: [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25],
      },
    },
    {
      sendReceive: {
        description: 'Get radio identifier',
        receive: {
          length: 8,
          type: 'variable',
        },
        send: [0x02],
      },
    },
    {
      sendReceive: {
        description: 'Begin clone operation',
        receive: {
          length: 1,
          type: 'exact',
          value: 0x06,
        },
        send: [0x06],
      },
    },
    {
      readSegment: {
        description: 'Read all memory segments',
        endChunk: {
          receive: {
            length: 1,
            type: 'exact',
            value: 0x06,
          },
          send: [0x06],
        },
        segments: ['channels', 'settings'],
        startChunk: {
          receive: {
            dataLength: 'segment.chunkSize',
            pattern: ['X', 'address', 'length', 'data'],
            type: 'pattern',
          },
          send: ['S', 'address', 'segment.chunkSize'],
        },
      },
    },
  ],
  writeMemory: [
    {
      sendReceive: {
        description: 'Send magic number',
        receive: {
          length: 1,
          type: 'exact',
          value: 0x06,
        },
        send: [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25],
      },
    },
    {
      writeSegment: {
        data: 'segment.data',
        description: 'Write all memory segments',
        receive: {
          length: 1,
          type: 'exact',
          value: 0x06,
        },
        segments: ['channels', 'settings'],
        send: ['X', 'segment.startAddress', 'segment.chunkSize'],
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
