# Serial Logging for Ham Radio Communication

This document explains how to use the enhanced logging capabilities in both the `ham-radio-driver` and `ham-radio-sniffer` projects to easily compare serial port communication data.

## Overview

The logging system provides standardized output formats that allow you to compare serial communication between:
- **Sniffer**: Captures raw serial data between computer and radio
- **Driver**: Logs protocol-level serial communication during radio operations

## Logging Utilities

The logging utilities are now part of the `@springfield/ham-radio-driver` project:
- **SerialLogger**: Provides consistent serial communication logging
- **LogComparator**: Compares log files between sniffer and driver
- **toHexWords**: Ensures consistent hex data formatting (from `@springfield/ham-radio-utils`)

The `@springfield/ham-radio-sniffer` project depends on `@springfield/ham-radio-driver` to use these logging utilities.

## Ham Radio Driver Logging

### Enabling Serial Logging

To enable serial logging in the ham-radio-driver, pass `true` as the fourth parameter to the RadioDriver constructor:

```typescript
import { RadioDriver } from '@springfield/ham-radio-driver';
import { logger } from 'loglayer';

const driver = new RadioDriver(radioConfig, logger, undefined, true);
```

### Log Format

Driver logs use the following format:
```
=== Radio Driver Serial Communication Log ===
Started at: 2024-01-15T10:30:00.000Z
Format: [Timestamp] [Direction] [Data]

[000.123] [SEND] 01 02 03 - Sending channel read command
[000.456] [RECV] 04 05 06 - Receiving channel data
```

### Log File Location

Log files are automatically created with timestamps:
- `radio-driver-2024-01-15T10-30-00-000Z.log`

## Ham Radio Sniffer Logging

### Enhanced Sniffer Usage

The sniffer now supports additional command-line options:

```bash
# Basic usage
node index.js /dev/ttyUSB0 /dev/ttyUSB1

# With custom baud rate
node index.js /dev/ttyUSB0 /dev/ttyUSB1 9600

# With timestamps
node index.js /dev/ttyUSB0 /dev/ttyUSB1 9600 --timestamps

# With custom log file
node index.js /dev/ttyUSB0 /dev/ttyUSB1 9600 --log-file my-sniffer.log
```

### Sniffer Log Format

Sniffer logs use the following format:
```
=== Ham Radio Sniffer Log ===
Started at: 2024-01-15T10:30:00.000Z
Computer Port: /dev/ttyUSB0
Radio Port: /dev/ttyUSB1
Baud Rate: 9600
Format: [Timestamp] [Direction] [Data]

[000.123] [COMPUTER->RADIO] 01 02 03
[000.456] [RADIO->COMPUTER] 04 05 06
```

## Log Comparison

### Using the Log Comparator

The `LogComparator` utility helps compare logs from both projects:

```typescript
import { LogComparator } from '@springfield/ham-radio-driver';

const comparator = new LogComparator('sniffer.log', 'driver.log');
const result = comparator.compareLogs();
console.log(comparator.generateReport(result));
```

### Command Line Comparison

```bash
# Compare logs and generate report
node log-comparator.js sniffer.log driver.log

# Save comparison report to file
node log-comparator.js sniffer.log driver.log comparison-report.txt
```

### Comparison Report

The comparison report includes:
- **Summary Statistics**: Total entries, matching entries, match rate
- **Timing Analysis**: Average, max, and min time differences
- **Unmatched Entries**: Entries that don't match between logs

Example report:
```
=== Log Comparison Report ===

Summary:
  Total Sniffer Entries: 150
  Total Driver Entries: 148
  Matching Entries: 145
  Match Rate: 96.7%

Timing Analysis:
  Average Time Difference: 0.002s
  Max Time Difference: 0.015s
  Min Time Difference: 0.000s

Unmatched Sniffer Entries (5):
  Line 23: [COMPUTER->RADIO] 01 02 03
  Line 45: [RADIO->COMPUTER] 04 05 06

Unmatched Driver Entries (3):
  Line 12: [SEND] 07 08 09 - Debug command
```

## Workflow for Debugging

### 1. Capture Sniffer Data

```bash
# Start sniffer with timestamps
node index.js /dev/ttyUSB0 /dev/ttyUSB1 9600 --timestamps --log-file sniffer.log
```

### 2. Run Driver Operation

```typescript
// Enable serial logging in driver
const driver = new RadioDriver(radioConfig, logger, undefined, true);
await driver.readRadio('/dev/ttyUSB0', progressIndicator);
```

### 3. Compare Logs

```bash
# Generate comparison report
node log-comparator.js sniffer.log radio-driver-*.log comparison-report.txt
```

### 4. Analyze Differences

- **High Match Rate (>95%)**: Communication is working correctly
- **Low Match Rate (<80%)**: Potential protocol issues or timing problems
- **Unmatched Entries**: Investigate specific data patterns that differ
- **Large Time Differences**: Check for timing or buffering issues

## Troubleshooting

### Common Issues

1. **No Matching Entries**
   - Check that both logs are from the same operation
   - Verify timestamps are enabled in sniffer
   - Ensure driver logging is enabled

2. **Many Unmatched Entries**
   - Protocol may have changed between sniffer and driver
   - Check for different baud rates or serial settings
   - Verify radio model configuration

3. **Large Time Differences**
   - System load affecting timing
   - Different serial port buffering
   - Protocol delays or retries

### Debug Tips

- Use timestamps in both sniffer and driver for accurate comparison
- Run sniffer and driver operations close together in time
- Check log file permissions and disk space
- Verify serial port paths match between tools

## Integration with Existing Code

### Adding Logging to Existing Code

```typescript
// Before
const driver = new RadioDriver(radioConfig, logger);

// After (with logging)
const driver = new RadioDriver(radioConfig, logger, undefined, true);
```

### Conditional Logging

```typescript
const enableLogging = process.env.ENABLE_SERIAL_LOGGING === 'true';
const driver = new RadioDriver(radioConfig, logger, undefined, enableLogging);
```

### Log File Management

```typescript
// Custom log file path
const logFile = `logs/radio-${Date.now()}.log`;
const driver = new RadioDriver(radioConfig, logger, undefined, true);
// Log file will be created automatically
```

## Performance Considerations

- Serial logging adds minimal overhead to communication
- Log files can grow large for extended operations
- Consider log rotation for production use
- Disable logging in production unless debugging

## Benefits of Centralized Logging

### Code Organization
- **Single Source of Truth**: All logging logic is centralized in `ham-radio-driver`
- **Consistent Behavior**: Both projects use the same logging implementation
- **Easier Maintenance**: Updates to logging logic only need to be made in one place

### Standardization
- **Unified Format**: Both sniffer and driver use identical log formats
- **Consistent Timestamps**: Same timestamp format across all projects
- **Standardized Hex Formatting**: `toHexWords` ensures consistent data representation

### Debugging Efficiency
- **Direct Comparison**: LogComparator can directly compare logs from both projects
- **Timing Analysis**: Built-in timing analysis for performance debugging
- **Detailed Reports**: Comprehensive comparison reports with statistics

## Future Enhancements

- Real-time log streaming
- Web-based log viewer
- Automatic protocol validation
- Integration with radio protocol specifications
- Additional log analysis tools
