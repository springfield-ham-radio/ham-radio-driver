# @springfield/ham-radio-driver

A TypeScript library providing a Domain Specific Language (DSL) for communicating with ham radio devices over serial connections. This library allows you to define radio protocols using a declarative configuration and execute them to read and write radio memory.

This module may not be used by the renderer due to the dependency on the serial port.

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
import type { Radio, RadioProgressIndicator } from '@springfield/ham-radio-api';
import { RadioModelId } from '@springfield/ham-radio-api';
import { createLogger } from 'loglayer';

// Define your radio configuration
const radio: Radio = {
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
        startAddress: 0,
        endAddress: 6143,
      },
      settings: {
        startAddress: 7872,
        endAddress: 8191,
      },
    },
  },
  serialConfig: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  },
  readMemory: [
    {
      sendReceive: {
        send: [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25],
        receive: { type: 'exact', value: 0x06, length: 1 },
        description: 'Send magic number',
      },
    },
    {
      readSegment: {
        segments: ['channels', 'settings'],
        startChunk: {
          send: ['S', 'address', 'segment.chunkSize'],
          receive: { type: 'pattern', pattern: ['X', 'address', 'length', 'data'], dataLength: 'segment.chunkSize' },
        },
        endChunk: {
          send: [0x06],
          receive: { type: 'exact', value: 0x06, length: 1 },
        },
        description: 'Read all memory segments',
      },
    },
  ],
  writeMemory: [
    {
      writeSegment: {
        segments: ['channels', 'settings'],
        send: ['X', 'segment.startAddress', 'segment.chunkSize'],
        data: 'segment.data',
        receive: { type: 'exact', value: 0x06, length: 1 },
        description: 'Write all memory segments',
      },
    },
  ],
};

// Create a progress indicator for cancellation support
const progressIndicator: RadioProgressIndicator = {
  setValue: (value: number) => {
    console.log(`Progress: ${Math.round(value * 100)}%`);
  },
  isCanceled: false,
};

// Create driver instance
const logger = createLogger();
const driver = new RadioDriver(radio, logger);

// Read radio memory
const memoryData = await driver.readRadio('/dev/ttyUSB0', progressIndicator);

// Write radio memory
await driver.writeRadio('/dev/ttyUSB0', memoryData, progressIndicator);

// Get radio information
console.log(`Radio model: ${driver.getRadioModel()}`);
console.log(`Memory segments: ${driver.getNumberMemorySegments()}`);
```

## Radio Configuration

The DSL uses a `Radio` interface to define how to communicate with a radio. Here are the key components:

### Radio Interface

```typescript
interface Radio {
  id: RadioId;
  settingsSchema: RadioSchema;
  memoryConfig: RadioMemoryConfig;
  serialConfig: RadioSerialConfig;
  readMemory: RadioProtocolStep[];
  writeMemory: RadioProtocolStep[];
}
```

### Radio ID

```typescript
interface RadioId {
  model: RadioModelId;
  name: string;
  manufacturer: string;
}
```

### Serial Configuration

```typescript
interface RadioSerialConfig {
  baudRate: number;
  dataBits?: 8 | 5 | 6 | 7;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd';
}
```

### Memory Configuration

```typescript
interface RadioMemoryConfig {
  chunkSize: number;
  segments: {
    [segmentName: string]: RadioMemorySegment;
  };
}

interface RadioMemorySegment {
  startAddress: number;
  endAddress: number;
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

#### Receive Patterns

```typescript
// Exact pattern - expect specific value
{ type: 'exact', value: 0x06, length: 1 }

// Variable pattern - accept any data of specified length
{ type: 'variable', length: 8 }

// Pattern matching - expect specific data structure
{ type: 'pattern', pattern: ['X', 'address', 'length', 'data'], dataLength: 'segment.chunkSize' }

// Any pattern - accept any data of specified length
{ type: 'any', length: 64 }
```

## API Reference

### RadioDriver Class

#### Constructor
```typescript
constructor(radio: Radio, logger: ILogLayer)
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
Returns the radio model name from the radio configuration.

##### getNumberMemorySegments
```typescript
getNumberMemorySegments(): number
```
Returns the total number of memory segments defined in the radio configuration.

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
