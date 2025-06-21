// Test script to demonstrate the import functionality programmatically

import { RadioDriver } from '../radio-driver.js';
import { ConsoleTransport, LogLayer } from 'loglayer';
import type { Radio, RadioProgressIndicator } from '@springfield/ham-radio-api';
import fs from 'node:fs';

const logger = new LogLayer({
  transport: new ConsoleTransport({
    logger: console,
  }),
});

class TestProgressIndicator implements RadioProgressIndicator {
  setValue(value: number): void {
    logger.debug(`Progress: ${Math.round(value * 100)}%`);
  }

  isCanceled = false;
}

const loadRadioConfig = (configFile: string): Radio => {
  try {
    const configData = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(configData) as Radio;
  } catch (error) {
    logger.withError(error).error(`Failed to load radio configuration from ${configFile}`);
    throw error;
  }
};

const testImport = async (configFile: string, serialPort?: string) => {
  logger.info('Testing import functionality');

  // Load radio configuration
  const radioConfig = loadRadioConfig(configFile);
  const radioDriver = new RadioDriver(radioConfig, logger);

  logger.info(`Radio model: ${radioDriver.getRadioModel()}`);
  logger.info(`Memory segments: ${radioDriver.getNumberMemorySegments()}`);

  if (!serialPort) {
    logger.info('No serial port provided, skipping actual radio communication');
    return;
  }

  // Test actual radio communication
  logger.info(`Testing with serial port: ${serialPort}`);

  try {
    const memory = await radioDriver.readRadio(serialPort, new TestProgressIndicator());

    if (memory) {
      logger.info(`Successfully read ${memory.length} bytes of memory data`);

      // Save test output
      const outputFile = `test-memory-${Date.now()}.bin`;
      fs.writeFileSync(outputFile, Buffer.from(memory));
      logger.info(`Test memory data saved to ${outputFile}`);
    } else {
      logger.info('Memory read was canceled');
    }
  } catch (error) {
    logger.withError(error).error('Failed to read radio memory');
  }
};

// Run test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const configFile = process.argv[2] || 'src/debug/baofeng-uv5r-config.json';
  const serialPort = process.argv[3]; // Optional

  testImport(configFile, serialPort).catch((error) => {
    logger.withError(error).error('Test failed');
    process.exit(1);
  });
}

export { testImport };
