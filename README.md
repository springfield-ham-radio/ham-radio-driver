# @springfield/ham-radio-driver

A TypeScript library providing a Domain Specific Language (DSL) for communicating with ham radio devices over serial connections. This library allows you to define radio protocols using a declarative configuration and execute them to read and write radio memory.

## Features

- **Declarative Protocol Definition**: Define radio communication protocols using JSON configuration
- **Serial Communication**: Built-in support for serial port communication with configurable parameters
- **Memory Management**: Support for segmented memory operations with configurable chunk sizes
- **Variable Support**: Dynamic variable assignment and usage during protocol execution
- **Progress Tracking**: Built-in progress indicator support for cancellation and progress reporting
- **Extensible**: Custom step types can be added for specialized operations
- **TypeScript Support**: Full TypeScript support with comprehensive type definitions

## Installation

```bash
yarn add @springfield/ham-radio-driver
```

## Quick Start

```typescript
import { RadioDriver } from '@springfield/ham-radio-driver';
import type { RadioProgressIndicator } from '@springfield/ham-radio-api';
import { createLogger } from 'loglayer';

// Define your radio protocol
const protocol = {
  radioModel: 'UV-5R',
  serialConfig: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
  },
  memoryConfig: {
    channels: {
      startAddress: 0x0000,
      endAddress: 0x1000,
      chunkSize: 64
    }
  },
  readMemory: [
    {
      sendReceive: {
        send: [0x02, 0x00, 0x00],
        receive: { type: 'exact', value: 0x06, length: 1 },
        description: 'Send read command'
      }
    }
  ],
  writeMemory: [
    {
      sendReceive: {
        send: [0x02, 0x01, 0x00],
        receive: { type: 'exact', value: 0x06, length: 1 },
        description: 'Send write command'
      }
    }
  ]
};

// Create a progress indicator for cancellation support
const progressIndicator: RadioProgressIndicator = {
  setValue: (value: number) => {
    console.log(`Progress: ${Math.round(value * 100)}%`);
  },
  isCanceled: false
};

// Create driver instance
const logger = createLogger();
const driver = new RadioDriver(protocol, logger);

// Read radio memory
const memoryData = await driver.readRadio('/dev/ttyUSB0', progressIndicator);

// Write radio memory
await driver.writeRadio('/dev/ttyUSB0', memoryData, progressIndicator);

// Get radio information
console.log(`Radio model: ${driver.getRadioModel()}`);
console.log(`Memory segments: ${driver.getNumberMemorySegments()}`);
```

## Protocol Definition

The DSL uses a JSON-based configuration to define how to communicate with a radio. Here are the key components:

### Serial Configuration

```typescript
interface SerialConfig {
  baudRate: number;
  dataBits?: 8 | 5 | 6 | 7;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd';
}
```

### Memory Configuration

```typescript
interface MemoryConfig {
  [segmentName: string]: {
    startAddress: number;
    endAddress: number;
    chunkSize: number;
  };
}
```

### Progress Indicator

The library requires a progress indicator for cancellation support and progress reporting:

```typescript
interface RadioProgressIndicator {
  setValue(value: number): void;
  isCanceled: boolean;
}
```

### Protocol Steps

The DSL supports several types of protocol steps:

- **SendReceive**: Send data and expect a specific response
- **Send**: Send data without expecting a response
- **Receive**: Wait for and validate incoming data
- **ReadSegment**: Read a memory segment with chunking
- **WriteSegment**: Write a memory segment with chunking
- **SetVariable**: Set a variable for use in subsequent steps

## API Reference

### RadioDriver Class

#### Constructor
```typescript
constructor(protocol: RadioProtocol, logger: ILogLayer)
```

#### Methods

##### readRadio
```typescript
async readRadio(serialPortPath: string, progressIndicator: RadioProgressIndicator): Promise<Uint8Array>
```
Reads radio memory and returns the data as a `Uint8Array`.

##### writeRadio
```typescript
async writeRadio(serialPortPath: string, data: Uint8Array, progressIndicator: RadioProgressIndicator): Promise<void>
```
Writes radio memory from a `Uint8Array`.

##### getRadioModel
```typescript
getRadioModel(): string
```
Returns the radio model name from the protocol configuration.

##### getNumberMemorySegments
```typescript
getNumberMemorySegments(): number
```
Returns the total number of memory segments defined in the protocol.

## Examples

See the `src/examples/example-usage.ts` file for comprehensive examples of how to use the DSL.

## Development

### Prerequisites

- Node.js 18+
- Yarn 4.9.1+

### Setup

```bash
yarn install
```

### Build

```bash
yarn build
```

### Test

```bash
yarn test:unit
```

### Lint

```bash
yarn lint
yarn lint:fix
```

## License

This project is licensed under the MIT License.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For support, please open an issue in the GitLab repository.
