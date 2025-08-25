# Ham Radio Driver

A high-level driver for reading and writing ham radio memory using DSL-based protocol specifications.

## Features

- **Protocol-Driven**: Uses DSL-based protocol specifications for radio communication
- **Multi-Radio Support**: Supports different radio models through configuration files
- **Memory Operations**: Read and write complete radio memory
- **Progress Tracking**: Real-time progress indication and cancellation support
- **Serial Logging**: Built-in serial communication logging for debugging
- **Log Comparison**: Tools to compare logs between sniffer and driver

## Serial Logging

The driver includes comprehensive serial logging capabilities to help debug radio communication:

### Enabling Serial Logging

```typescript
import { RadioDriver } from '@springfield/ham-radio-driver';

// Enable serial logging
const driver = new RadioDriver(radioConfig, logger, undefined, true);
```

### Log Comparison

Compare logs between the sniffer and driver:

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

For detailed documentation, see [Serial Logging Guide](docs/serial-logging.md).

## Installation

```bash
npm install @springfield/ham-radio-driver
```

## Quick Start

```typescript
import { RadioDriver } from '@springfield/ham-radio-driver';
import { RadioProgressIndicator } from '@springfield/ham-radio-api';

// Create driver instance
const driver = new RadioDriver(radioConfig, logger);

// Read radio memory
const progressIndicator = new RadioProgressIndicator();
const memoryData = await driver.readRadio('/dev/ttyUSB0', progressIndicator);

// Write radio memory
await driver.writeRadio('/dev/ttyUSB0', memoryData, progressIndicator);
```

## Documentation

- [Serial Logging Guide](docs/serial-logging.md) - Detailed guide for serial logging and log comparison
- [API Documentation](docs/api.md) - Complete API reference
- [Protocol DSL](docs/protocol-dsl.md) - Protocol specification language guide

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
