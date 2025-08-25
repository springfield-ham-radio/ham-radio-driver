import { describe, it, beforeEach, afterEach } from 'node:test';
import { expect } from 'chai';
import * as fs from 'fs';
import { LogComparator } from '../../../src/utils/log-comparator.js';
import { TempDir } from '../../utils/temp-dir.js';

describe('LogComparator', () => {
  let tempDir: TempDir;
  let snifferLogPath: string;
  let driverLogPath: string;

  beforeEach(() => {
    tempDir = new TempDir();
    tempDir.create('log-comparator-test');
    snifferLogPath = tempDir.getFilePath('sniffer.log');
    driverLogPath = tempDir.getFilePath('driver.log');
  });

  afterEach(() => {
    tempDir.cleanup();
  });

  describe('constructor', () => {
    it('should create comparator with log file paths', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);

      expect(comparator).to.be.instanceOf(LogComparator);
    });
  });

  describe('parseLogFile', () => {
    it('should parse valid log entries', () => {
      const logContent = [
        '=== Radio Driver Serial Communication Log ===',
        'Started at: 2024-01-01T00:00:00.000Z',
        'Format: [Timestamp] [Direction] [Data]',
        '',
        '[000.123] [SEND] 01 02 03',
        '[000.456] [RECV] 04 05 06',
        '[000.789] [SEND] 07 08 09 - Test command',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, logContent);
      const comparator = new LogComparator(snifferLogPath, driverLogPath);

      // Access private method for testing
      const entries = (comparator as any).parseLogFile(snifferLogPath, 'sniffer');

      expect(entries).to.have.length(3);
      expect(entries[0]).to.deep.include({
        timestamp: '000.123',
        direction: 'SEND',
        data: '01 02 03',
        source: 'sniffer',
        lineNumber: 5,
      });
      expect(entries[1]).to.deep.include({
        timestamp: '000.456',
        direction: 'RECV',
        data: '04 05 06',
        source: 'sniffer',
        lineNumber: 6,
      });
      expect(entries[2]).to.deep.include({
        timestamp: '000.789',
        direction: 'SEND',
        data: '07 08 09',
        description: 'Test command',
        source: 'sniffer',
        lineNumber: 7,
      });
    });

    it('should skip header lines and empty lines', () => {
      const logContent = [
        '=== Radio Driver Serial Communication Log ===',
        'Started at: 2024-01-01T00:00:00.000Z',
        'Format: [Timestamp] [Direction] [Data]',
        '',
        '[INFO] Some info message',
        '[ERROR] Some error message',
        '',
        '[000.123] [SEND] 01 02 03',
        '',
        '[000.456] [RECV] 04 05 06',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, logContent);
      const comparator = new LogComparator(snifferLogPath, driverLogPath);

      const entries = (comparator as any).parseLogFile(snifferLogPath, 'sniffer');

      expect(entries).to.have.length(2);
      expect(entries[0].data).to.equal('01 02 03');
      expect(entries[1].data).to.equal('04 05 06');
    });

    it('should handle missing log file', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);

      const entries = (comparator as any).parseLogFile(snifferLogPath, 'sniffer');

      expect(entries).to.be.an('array').that.is.empty;
    });

    it('should handle log entries without timestamps', () => {
      const logContent = [
        '[SEND] 01 02 03',
        '[RECV] 04 05 06 - Response data',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, logContent);
      const comparator = new LogComparator(snifferLogPath, driverLogPath);

      const entries = (comparator as any).parseLogFile(snifferLogPath, 'sniffer');

      expect(entries).to.have.length(2);
      expect(entries[0].timestamp).to.equal('');
      expect(entries[0].data).to.equal('01 02 03');
      expect(entries[1].timestamp).to.equal('');
      expect(entries[1].data).to.equal('04 05 06');
      expect(entries[1].description).to.equal('Response data');
    });
  });

  describe('parseLogLine', () => {
    it('should parse log line with timestamp and direction', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const line = '[000.123] [SEND] 01 02 03';

      const entry = (comparator as any).parseLogLine(line, 'sniffer', 1);

      expect(entry).to.deep.include({
        timestamp: '000.123',
        direction: 'SEND',
        data: '01 02 03',
        source: 'sniffer',
        lineNumber: 1,
      });
    });

    it('should parse log line with description', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const line = '[000.456] [RECV] 04 05 06 - Response data';

      const entry = (comparator as any).parseLogLine(line, 'driver', 2);

      expect(entry).to.deep.include({
        timestamp: '000.456',
        direction: 'RECV',
        data: '04 05 06',
        description: 'Response data',
        source: 'driver',
        lineNumber: 2,
      });
    });

    it('should parse log line without timestamp', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const line = '[SEND] 01 02 03';

      const entry = (comparator as any).parseLogLine(line, 'sniffer', 1);

      expect(entry).to.deep.include({
        timestamp: '',
        direction: 'SEND',
        data: '01 02 03',
        source: 'sniffer',
        lineNumber: 1,
      });
    });

    it('should return null for invalid log line', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const line = 'Invalid log line format';

      const entry = (comparator as any).parseLogLine(line, 'sniffer', 1);

      expect(entry).to.be.null;
    });

        it('should handle log line with only direction', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const line = '[SEND]';

      const entry = (comparator as any).parseLogLine(line, 'sniffer', 1);

      expect(entry).to.be.null;
    });
  });

  describe('compareLogs', () => {
    it('should find matching entries', () => {
      const snifferContent = [
        '[000.123] [SEND] 01 02 03',
        '[000.456] [RECV] 04 05 06',
        '[000.789] [SEND] 07 08 09',
      ].join('\n');

      const driverContent = [
        '[000.124] [SEND] 01 02 03',
        '[000.457] [RECV] 04 05 06',
        '[000.790] [SEND] 07 08 09',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(3);
      expect(result.totalSnifferEntries).to.equal(3);
      expect(result.totalDriverEntries).to.equal(3);
      expect(result.unmatchedSnifferEntries).to.have.length(0);
      expect(result.unmatchedDriverEntries).to.have.length(0);
    });

    it('should identify unmatched entries', () => {
      const snifferContent = [
        '[000.123] [SEND] 01 02 03',
        '[000.456] [RECV] 04 05 06',
        '[000.789] [SEND] 07 08 09',
      ].join('\n');

      const driverContent = [
        '[000.124] [SEND] 01 02 03',
        '[000.457] [RECV] 04 05 06',
        '[000.790] [SEND] 0A 0B 0C', // Different data
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(2);
      expect(result.unmatchedSnifferEntries).to.have.length(1);
      expect(result.unmatchedDriverEntries).to.have.length(1);
      expect(result.unmatchedSnifferEntries[0].data).to.equal('07 08 09');
      expect(result.unmatchedDriverEntries[0].data).to.equal('0A 0B 0C');
    });

    it('should match entries with different timestamps', () => {
      const snifferContent = [
        '[000.123] [SEND] 01 02 03',
        '[000.456] [RECV] 04 05 06',
      ].join('\n');

      const driverContent = [
        '[001.234] [SEND] 01 02 03', // Different timestamp
        '[002.345] [RECV] 04 05 06', // Different timestamp
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(2);
      expect(result.timingAnalysis.averageTimeDifference).to.be.greaterThan(0);
    });

    it('should handle entries without timestamps', () => {
      const snifferContent = [
        '[SEND] 01 02 03',
        '[RECV] 04 05 06',
      ].join('\n');

      const driverContent = [
        '[SEND] 01 02 03',
        '[RECV] 04 05 06',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(2);
    });

    it('should handle empty log files', () => {
      fs.writeFileSync(snifferLogPath, '');
      fs.writeFileSync(driverLogPath, '');

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(0);
      expect(result.totalSnifferEntries).to.equal(0);
      expect(result.totalDriverEntries).to.equal(0);
    });

    it('should handle missing log files', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(0);
      expect(result.totalSnifferEntries).to.equal(0);
      expect(result.totalDriverEntries).to.equal(0);
    });
  });

  describe('calculateTimingAnalysis', () => {
    it('should calculate timing statistics for matched entries', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const timeDifferences = [0.1, 0.2, 0.3, 0.4, 0.5];

      const analysis = (comparator as any).calculateTimingAnalysis(timeDifferences);

      expect(analysis.averageTimeDifference).to.equal(0.3);
      expect(analysis.maxTimeDifference).to.equal(0.5);
      expect(analysis.minTimeDifference).to.equal(0.1);
    });

    it('should handle empty time differences array', () => {
      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const timeDifferences: number[] = [];

      const analysis = (comparator as any).calculateTimingAnalysis(timeDifferences);

      expect(analysis.averageTimeDifference).to.equal(0);
      expect(analysis.maxTimeDifference).to.equal(0);
      expect(analysis.minTimeDifference).to.equal(0);
    });
  });

  describe('generateReport', () => {
    it('should generate comprehensive report', () => {
      const snifferContent = [
        '[000.123] [SEND] 01 02 03',
        '[000.456] [RECV] 04 05 06',
        '[000.789] [SEND] 07 08 09',
      ].join('\n');

      const driverContent = [
        '[000.124] [SEND] 01 02 03',
        '[000.457] [RECV] 04 05 06',
        '[000.790] [SEND] 0A 0B 0C',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();
      const report = comparator.generateReport(result);

      expect(report).to.include('=== Log Comparison Report ===');
      expect(report).to.include('Total Sniffer Entries: 3');
      expect(report).to.include('Total Driver Entries: 3');
      expect(report).to.include('Matching Entries: 2');
      expect(report).to.include('Match Rate: 66.7%');
      expect(report).to.include('Timing Analysis:');
      expect(report).to.include('Unmatched Sniffer Entries (1):');
      expect(report).to.include('Unmatched Driver Entries (1):');
    });

    it('should handle report with no unmatched entries', () => {
      const snifferContent = [
        '[000.123] [SEND] 01 02 03',
        '[000.456] [RECV] 04 05 06',
      ].join('\n');

      const driverContent = [
        '[000.124] [SEND] 01 02 03',
        '[000.457] [RECV] 04 05 06',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();
      const report = comparator.generateReport(result);

      expect(report).to.include('Match Rate: 100.0%');
      expect(report).to.not.include('Unmatched Sniffer Entries');
      expect(report).to.not.include('Unmatched Driver Entries');
    });

    it('should handle report with empty log files', () => {
      fs.writeFileSync(snifferLogPath, '');
      fs.writeFileSync(driverLogPath, '');

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();
      const report = comparator.generateReport(result);

      expect(report).to.include('Total Sniffer Entries: 0');
      expect(report).to.include('Total Driver Entries: 0');
      expect(report).to.include('Matching Entries: 0');
      expect(report).to.include('Match Rate: 0.0%');
    });
  });

  describe('saveReport', () => {
    it('should save report to file', () => {
      const snifferContent = '[000.123] [SEND] 01 02 03';
      const driverContent = '[000.124] [SEND] 01 02 03';

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();
      const reportPath = tempDir.getFilePath('report.txt');

      comparator.saveReport(result, reportPath);

      expect(fs.existsSync(reportPath)).to.be.true;

      const savedReport = fs.readFileSync(reportPath, 'utf8');
      expect(savedReport).to.include('=== Log Comparison Report ===');
      expect(savedReport).to.include('Matching Entries: 1');
    });
  });

  describe('integration tests', () => {
    it('should handle complex log comparison scenario', () => {
      const snifferContent = [
        '=== Sniffer Log ===',
        'Started at: 2024-01-01T00:00:00.000Z',
        '',
        '[000.100] [SEND] 01 02 03 - Command 1',
        '[000.200] [RECV] 04 05 06 - Response 1',
        '[000.300] [SEND] 07 08 09 - Command 2',
        '[000.400] [RECV] 0A 0B 0C - Response 2',
        '[000.500] [SEND] 0D 0E 0F - Command 3',
      ].join('\n');

      const driverContent = [
        '=== Driver Log ===',
        'Started at: 2024-01-01T00:00:00.000Z',
        '',
        '[000.101] [SEND] 01 02 03 - Command 1',
        '[000.201] [RECV] 04 05 06 - Response 1',
        '[000.301] [SEND] 07 08 09 - Command 2',
        '[000.401] [RECV] 0A 0B 0C - Response 2',
        '[000.501] [SEND] 10 11 12 - Command 4', // Different command
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(4);
      expect(result.totalSnifferEntries).to.equal(5);
      expect(result.totalDriverEntries).to.equal(5);
      expect(result.unmatchedSnifferEntries).to.have.length(1);
      expect(result.unmatchedDriverEntries).to.have.length(1);
      expect(result.unmatchedSnifferEntries[0].data).to.equal('0D 0E 0F');
      expect(result.unmatchedDriverEntries[0].data).to.equal('10 11 12');
      expect(result.timingAnalysis.averageTimeDifference).to.be.closeTo(0.001, 0.001);
    });

    it('should handle logs with mixed timestamp formats', () => {
      const snifferContent = [
        '[000.100] [SEND] 01 02 03',
        '[RECV] 04 05 06',
        '[000.300] [SEND] 07 08 09',
      ].join('\n');

      const driverContent = [
        '[000.101] [SEND] 01 02 03',
        '[RECV] 04 05 06',
        '[000.301] [SEND] 07 08 09',
      ].join('\n');

      fs.writeFileSync(snifferLogPath, snifferContent);
      fs.writeFileSync(driverLogPath, driverContent);

      const comparator = new LogComparator(snifferLogPath, driverLogPath);
      const result = comparator.compareLogs();

      expect(result.matchingEntries).to.equal(3);
      expect(result.totalSnifferEntries).to.equal(3);
      expect(result.totalDriverEntries).to.equal(3);
    });
  });
});
