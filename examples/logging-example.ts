#!/usr/bin/env tsx

/**
 * Example demonstrating the logging utilities from ham-radio-driver
 */

import { SerialLogger, LogComparator } from '../src/utils/index.js';
import { createLogger } from 'loglayer';

async function main(): Promise<void> {
  console.log('=== Ham Radio Driver Logging Example ===\n');

  // Create a logger
  const logger = createLogger();

  // Example 1: Serial Logger
  console.log('1. Creating Serial Logger...');
  const serialLogger = new SerialLogger(logger, 'example-driver.log');

  // Simulate some serial communication
  serialLogger.logSend(new Uint8Array([0x50, 0xbb, 0xff]), 'Magic number');
  serialLogger.logReceive(new Uint8Array([0x06]), 'ACK response');
  serialLogger.logSend(new Uint8Array([0x53, 0x00, 0x00, 0x40]), 'Read command');
  serialLogger.logReceive(new Uint8Array([0x58, 0x00, 0x00, 0x40, 0x01, 0x02, 0x03, 0x04]), 'Data response');

  console.log(`Log file created: ${serialLogger.getLogFilePath()}`);
  serialLogger.close();

  // Example 2: Create a sniffer log for comparison
  console.log('\n2. Creating example sniffer log...');
  const snifferLog = `=== Radio Sniffer Serial Communication Log ===
Started at: 2024-01-15T10:30:00.000Z
Format: [Timestamp] [Direction] [Data]

[000.123] [COMPUTER->RADIO] 50 bb ff - Magic number
[000.456] [RADIO->COMPUTER] 06 - ACK response
[000.789] [COMPUTER->RADIO] 53 00 00 40 - Read command
[001.012] [RADIO->COMPUTER] 58 00 00 40 01 02 03 04 - Data response
`;

  // Write sniffer log to file
  const fs = await import('fs');
  fs.writeFileSync('example-sniffer.log', snifferLog);
  console.log('Sniffer log created: example-sniffer.log');

  // Example 3: Log Comparison
  console.log('\n3. Comparing logs...');
  const comparator = new LogComparator('example-sniffer.log', 'example-driver.log');
  const result = comparator.compareLogs();

  console.log('\nComparison Report:');
  console.log(comparator.generateReport(result));

  // Save comparison report
  const reportPath = 'example-comparison-report.txt';
  comparator.saveReport(result, reportPath);
  console.log(`\nComparison report saved to: ${reportPath}`);

  // Clean up example files
  console.log('\n4. Cleaning up example files...');
  fs.unlinkSync('example-driver.log');
  fs.unlinkSync('example-sniffer.log');
  fs.unlinkSync(reportPath);
  console.log('Example files cleaned up.');

  console.log('\n=== Example completed successfully! ===');
}

// Run the example
main().catch(console.error);
