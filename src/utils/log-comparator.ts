import * as fs from 'fs';

/**
 * Log entry interface for parsing log files
 */
export interface LogEntry {
  timestamp: string;
  direction: string;
  data: string;
  description?: string;
  source: 'sniffer' | 'driver';
  lineNumber: number;
}

/**
 * Log comparison result
 */
export interface ComparisonResult {
  matchingEntries: number;
  totalSnifferEntries: number;
  totalDriverEntries: number;
  unmatchedSnifferEntries: LogEntry[];
  unmatchedDriverEntries: LogEntry[];
  timingAnalysis: {
    averageTimeDifference: number;
    maxTimeDifference: number;
    minTimeDifference: number;
  };
}

/**
 * LogComparator provides utilities to compare log files from the sniffer and driver
 * to help identify differences and similarities in serial communication.
 */
export class LogComparator {
  private snifferLogPath: string;
  private driverLogPath: string;

  constructor(snifferLogPath: string, driverLogPath: string) {
    this.snifferLogPath = snifferLogPath;
    this.driverLogPath = driverLogPath;
  }

  /**
   * Parses a log file and extracts log entries
   *
   * @param filePath - Path to the log file
   * @param source - Source identifier ('sniffer' or 'driver')
   * @returns Array of parsed log entries
   */
  private parseLogFile(filePath: string, source: 'sniffer' | 'driver'): LogEntry[] {
    const entries: LogEntry[] = [];

    if (!fs.existsSync(filePath)) {
      console.error(`Log file not found: ${filePath}`);
      return entries;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line || line.startsWith('===') || line.startsWith('Started at:') || line.startsWith('Format:') || line.startsWith('[INFO]') || line.startsWith('[ERROR]')) {
        continue;
      }

      const entry = this.parseLogLine(line, source, i + 1);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Parses a single log line into a LogEntry object
   *
   * @param line - The log line to parse
   * @param source - Source identifier
   * @param lineNumber - Line number in the file
   * @returns Parsed log entry or null if parsing fails
   */
  private parseLogLine(line: string, source: 'sniffer' | 'driver', lineNumber: number): LogEntry | null {
    // Parse timestamp format: [000.123] or empty
    const timestampMatch = line.match(/^\[(\d+\.\d+)\]\s*/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';

    // Remove timestamp from line for further parsing
    const lineWithoutTimestamp = timestampMatch ? line.substring(timestampMatch[0].length) : line;

    // Parse direction and data: [DIRECTION] data
    const directionMatch = lineWithoutTimestamp.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!directionMatch) {
      return null;
    }

    const direction = directionMatch[1];
    const dataAndDescription = directionMatch[2];

    // Split data and description (description starts with " - ")
    const descriptionMatch = dataAndDescription.match(/^(.+?)\s*-\s*(.+)$/);
    const data = descriptionMatch ? descriptionMatch[1] : dataAndDescription;
    const description = descriptionMatch ? descriptionMatch[2] : undefined;

    return {
      timestamp,
      direction,
      data: data.trim(),
      description,
      source,
      lineNumber,
    };
  }

  /**
   * Compares log files and returns detailed comparison results
   *
   * @returns Comparison result with matching and unmatched entries
   */
  compareLogs(): ComparisonResult {
    const snifferEntries = this.parseLogFile(this.snifferLogPath, 'sniffer');
    const driverEntries = this.parseLogFile(this.driverLogPath, 'driver');

    console.log(`Parsed ${snifferEntries.length} sniffer entries and ${driverEntries.length} driver entries`);

    const matchingEntries: LogEntry[] = [];
    const unmatchedSnifferEntries: LogEntry[] = [];
    const unmatchedDriverEntries: LogEntry[] = [];
    const timeDifferences: number[] = [];

    // Create a map of driver entries by data for quick lookup
    const driverDataMap = new Map<string, LogEntry[]>();
    driverEntries.forEach((entry) => {
      const key = `${entry.direction}:${entry.data}`;
      if (!driverDataMap.has(key)) {
        driverDataMap.set(key, []);
      }
      driverDataMap.get(key)!.push(entry);
    });

    // Match sniffer entries with driver entries
    snifferEntries.forEach((snifferEntry) => {
      const key = `${snifferEntry.direction}:${snifferEntry.data}`;
      const matchingDriverEntries = driverDataMap.get(key);

      if (matchingDriverEntries && matchingDriverEntries.length > 0) {
        // Find the best match based on timing
        let bestMatch: LogEntry | null = null;
        let bestTimeDiff = Infinity;

        matchingDriverEntries.forEach((driverEntry) => {
          if (snifferEntry.timestamp && driverEntry.timestamp) {
            const timeDiff = Math.abs(parseFloat(snifferEntry.timestamp) - parseFloat(driverEntry.timestamp));
            if (timeDiff < bestTimeDiff) {
              bestTimeDiff = timeDiff;
              bestMatch = driverEntry;
            }
          } else if (!snifferEntry.timestamp && !driverEntry.timestamp) {
            // If neither has timestamp, use the first match
            bestMatch = driverEntry;
            bestTimeDiff = 0;
          }
        });

        if (bestMatch) {
          matchingEntries.push(snifferEntry);
          timeDifferences.push(bestTimeDiff);

          // Remove the matched entry from the map
          const remainingEntries = matchingDriverEntries.filter((entry) => entry !== bestMatch);
          if (remainingEntries.length > 0) {
            driverDataMap.set(key, remainingEntries);
          } else {
            driverDataMap.delete(key);
          }
        } else {
          unmatchedSnifferEntries.push(snifferEntry);
        }
      } else {
        unmatchedSnifferEntries.push(snifferEntry);
      }
    });

    // Collect unmatched driver entries
    driverDataMap.forEach((entries) => {
      unmatchedDriverEntries.push(...entries);
    });

    // Calculate timing statistics
    const timingAnalysis = this.calculateTimingAnalysis(timeDifferences);

    return {
      matchingEntries: matchingEntries.length,
      totalSnifferEntries: snifferEntries.length,
      totalDriverEntries: driverEntries.length,
      unmatchedSnifferEntries,
      unmatchedDriverEntries,
      timingAnalysis,
    };
  }

  /**
   * Calculates timing analysis statistics
   *
   * @param timeDifferences - Array of time differences between matched entries
   * @returns Timing analysis object
   */
  private calculateTimingAnalysis(timeDifferences: number[]): ComparisonResult['timingAnalysis'] {
    if (timeDifferences.length === 0) {
      return {
        averageTimeDifference: 0,
        maxTimeDifference: 0,
        minTimeDifference: 0,
      };
    }

    const sum = timeDifferences.reduce((acc, diff) => acc + diff, 0);
    const average = sum / timeDifferences.length;
    const max = Math.max(...timeDifferences);
    const min = Math.min(...timeDifferences);

    return {
      averageTimeDifference: average,
      maxTimeDifference: max,
      minTimeDifference: min,
    };
  }

  /**
   * Generates a detailed comparison report
   *
   * @param result - Comparison result
   * @returns Formatted report string
   */
  generateReport(result: ComparisonResult): string {
    const report: string[] = [];

    report.push('=== Log Comparison Report ===');
    report.push('');

    // Summary statistics
    report.push('Summary:');
    report.push(`  Total Sniffer Entries: ${result.totalSnifferEntries}`);
    report.push(`  Total Driver Entries: ${result.totalDriverEntries}`);
    report.push(`  Matching Entries: ${result.matchingEntries}`);
    const maxEntries = Math.max(result.totalSnifferEntries, result.totalDriverEntries);
    const matchRate = maxEntries > 0 ? ((result.matchingEntries / maxEntries) * 100).toFixed(1) : '0.0';
    report.push(`  Match Rate: ${matchRate}%`);
    report.push('');

    // Timing analysis
    report.push('Timing Analysis:');
    report.push(`  Average Time Difference: ${result.timingAnalysis.averageTimeDifference.toFixed(3)}s`);
    report.push(`  Max Time Difference: ${result.timingAnalysis.maxTimeDifference.toFixed(3)}s`);
    report.push(`  Min Time Difference: ${result.timingAnalysis.minTimeDifference.toFixed(3)}s`);
    report.push('');

    // Unmatched entries
    if (result.unmatchedSnifferEntries.length > 0) {
      report.push(`Unmatched Sniffer Entries (${result.unmatchedSnifferEntries.length}):`);
      result.unmatchedSnifferEntries.forEach((entry) => {
        report.push(`  Line ${entry.lineNumber}: [${entry.direction}] ${entry.data}`);
      });
      report.push('');
    }

    if (result.unmatchedDriverEntries.length > 0) {
      report.push(`Unmatched Driver Entries (${result.unmatchedDriverEntries.length}):`);
      result.unmatchedDriverEntries.forEach((entry) => {
        report.push(`  Line ${entry.lineNumber}: [${entry.direction}] ${entry.data}`);
      });
      report.push('');
    }

    return report.join('\n');
  }

  /**
   * Saves the comparison report to a file
   *
   * @param result - Comparison result
   * @param outputPath - Path to save the report
   */
  saveReport(result: ComparisonResult, outputPath: string): void {
    const report = this.generateReport(result);
    fs.writeFileSync(outputPath, report);
    console.log(`Comparison report saved to: ${outputPath}`);
  }
}

/**
 * Command-line interface for log comparison
 */
function main(): void {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: node log-comparator.js <sniffer-log> <driver-log> [output-report]');
    console.log('');
    console.log('Examples:');
    console.log('  node log-comparator.js sniffer.log driver.log');
    console.log('  node log-comparator.js sniffer.log driver.log comparison-report.txt');
    process.exit(1);
  }

  const snifferLogPath = args[0];
  const driverLogPath = args[1];
  const outputPath = args[2] || 'log-comparison-report.txt';

  const comparator = new LogComparator(snifferLogPath, driverLogPath);
  const result = comparator.compareLogs();

  console.log(comparator.generateReport(result));
  comparator.saveReport(result, outputPath);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
