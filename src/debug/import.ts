// node dist/debug/import.js <port> <radio-config-file>

import { RadioDriver } from '../radio-driver.js';
import { ConsoleTransport, LogLayer } from 'loglayer';
import type { Radio, RadioProgressIndicator } from '@springfield/ham-radio-api';
import { SerialPort } from 'serialport';
import fs from 'node:fs';
import { createUILoggerWithCallback } from '@springfield/ham-radio-utils';

const logger = new LogLayer({
  transport: new ConsoleTransport({
    logger: console,
  }),
});

logger.setLevel('debug');

// Array to capture all UI log entries
const uiLogEntries: any[] = [];

// UI logger that pushes log entries to the array
const uiLogger = createUILoggerWithCallback((entry) => {
  uiLogEntries.push(entry);
});

class ConsoleProgressIndicator implements RadioProgressIndicator {
  setValue(value: number): void {
    if (0 != value && 1 != value) {
      process.stdout.write('.');
    }

    if (1 == value) {
      process.stdout.write('\n');
    }
  }

  isCanceled = false;
}

const reset = (path: string) => {
  return new Promise<void>((resolve, reject) => {
    const port = new SerialPort({ autoOpen: false, baudRate: 9600, path });
    port.open((error) => {
      port.close(() => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });
};

const loadRadioConfig = (configFile: string): Radio => {
  try {
    const configData = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(configData) as Radio;
  } catch (error) {
    logger.withError(error).error(`Failed to load radio configuration from ${configFile}`);
    throw error;
  }
};

const test = async () => {
  if (process.argv.length < 4) {
    console.error('Usage: node dist/debug/import.js <port> <radio-config-file>');
    process.exit(1);
  }

  const serialPortPath = process.argv[2];
  const configFile = process.argv[3];

  logger.withMetadata({ serialPortPath, configFile }).info('Loading radio configuration');

  const radioConfig = loadRadioConfig(configFile);
  const radioDriver = new RadioDriver(radioConfig, logger, uiLogger);

  logger.info(`Radio model: ${radioDriver.getRadioModel()}`);
  logger.info(`Memory segments: ${radioDriver.getNumberMemorySegments()}`);

  logger.withMetadata({ serialPortPath }).info('Resetting port');
  await reset(serialPortPath);

  logger.withMetadata({ serialPortPath }).info('Importing from radio');
  const memory = await radioDriver.readRadio(serialPortPath, new ConsoleProgressIndicator());

  if (memory == undefined) {
    logger.info('Canceled');
    return;
  }

  logger.info(`Successfully read ${memory.length} bytes of memory data`);

  // Save the raw memory data to a file
  const outputFile = `memory-${Date.now()}.bin`;
  fs.writeFileSync(outputFile, Buffer.from(memory));
  logger.info(`Raw memory data saved to ${outputFile}`);

  // Also save as hex dump for inspection
  const hexFile = `memory-${Date.now()}.hex`;
  const hexDump = Array.from(memory)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');
  fs.writeFileSync(hexFile, hexDump);
  logger.info(`Hex dump saved to ${hexFile}`);

  // Display first 64 bytes as hex for verification
  const preview = Array.from(memory.slice(0, 64))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join(' ');
  logger.info(`First 64 bytes: ${preview}`);

  // Write the UI log entries to a file
  const uiLogFile = `ui-log-${Date.now()}.json`;
  fs.writeFileSync(uiLogFile, JSON.stringify(uiLogEntries, null, 2));
  logger.info(`UI log saved to ${uiLogFile}`);
};

test().catch((error) => {
  logger.withError(error).error('Import failed');
  process.exit(1);
});
