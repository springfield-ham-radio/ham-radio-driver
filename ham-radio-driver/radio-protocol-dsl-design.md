# Radio Protocol DSL Design Document

## Overview

This document describes a Domain Specific Language (DSL) for defining radio communication protocols in a declarative, JSON-based format. The DSL allows for radio-independent driver implementations that can support multiple radio types through configuration rather than hard-coded protocol logic.

## Problem Statement

The current `BaofengDriver` implementation is tightly coupled to the Baofeng UV-5R radio protocol. To support additional radio types, new driver classes must be created with duplicated protocol logic. This approach doesn't scale well and makes it difficult to maintain consistency across different radio implementations.

## Solution

Create a declarative DSL that describes the communication protocol for each radio type. The driver implementation becomes a generic interpreter that executes protocol steps defined in JSON configuration files.

## DSL Structure

### Root Configuration

```json
{
  "radioModel": "baofeng-uv5r",
  "serialConfig": {
    "baudRate": 9600,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  },
  "memoryConfig": {
    "channelSegment": {
      "startAddress": "0x0000",
      "endAddress": "0x17ff",
      "chunkSize": 64
    },
    "settingsSegment": {
      "startAddress": "0x1ec0",
      "endAddress": "0x1fff",
      "chunkSize": 64
    }
  },
  "readMemory": [...],
  "writeMemory": [...]
}
```

### Protocol Steps

Each step in the protocol is defined as an object with a single key representing the step type and a value containing the step configuration.

#### 1. Send/Receive Step

```json
{
  "sendReceive": {
    "send": [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25],
    "receive": {
      "type": "exact",
      "value": 0x06,
      "length": 1
    },
    "timeout": 5000,
    "description": "Send magic number and expect ACK"
  }
}
```

#### 2. Send Only Step

```json
{
  "send": {
    "data": [0x02],
    "description": "Request radio identifier"
  }
}
```

#### 3. Receive Only Step

```json
{
  "receive": {
    "type": "variable",
    "length": 8,
    "description": "Receive radio identifier"
  }
}
```

#### 4. Read Segment Command

```json
{
  "readSegment": {
    "segments": ["channels", "settings"],
    "startChunk": {
      "send": ["S", "address", "segment.chunkSize"],
      "receive": {
        "type": "pattern",
        "pattern": [
          "X",                           // Literal 'X' (0x58) - 1 byte
          { "field": "address", "size": 2 },  // Address (high + low) - 2 bytes
          { "field": "length", "size": 1 },   // Length - 1 byte
          { "field": "data", "size": 0 }      // Data (variable size) - rest of response
        ],
        "dataLength": "segment.chunkSize"
      }
    },
    "endChunk": {
      "send": [0x06],
      "receive": {
        "type": "exact",
        "value": 0x06,
        "length": 1
      }
    },
    "description": "Read all memory segments"
  }
}
```

#### 5. Write Segment Command

```json
{
  "writeSegment": {
    "segments": ["channels", "settings"],
    "send": ["X", "segment.startAddress", "segment.chunkSize"],
    "data": "segment.data",
    "receive": {
      "type": "exact",
      "value": 0x06,
      "length": 1
    },
    "description": "Write all memory segments"
  }
}
```

#### 6. Variable Assignment

```json
{
  "setVariable": {
    "name": "nextAddress",
    "value": "0x0000"
  }
}
```

## Complete Example: Baofeng UV-5R Read Protocol

```json
{
  "radioModel": "baofeng-uv5r",
  "serialConfig": {
    "baudRate": 9600
  },
  "memoryConfig": {
    "channels": {
      "startAddress": "0x0000",
      "endAddress": "0x17ff",
      "chunkSize": 64
    },
    "settings": {
      "startAddress": "0x1ec0",
      "endAddress": "0x1fff",
      "chunkSize": 64
    }
  },
  "readMemory": [
    {
      "sendReceive": {
        "send": [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25],
        "receive": {
          "type": "exact",
          "value": 0x06,
          "length": 1
        },
        "description": "Send magic number"
      }
    },
    {
      "sendReceive": {
        "send": [0x02],
        "receive": {
          "type": "variable",
          "length": 8
        },
        "description": "Get radio identifier"
      }
    },
    {
      "sendReceive": {
        "send": [0x06],
        "receive": {
          "type": "exact",
          "value": 0x06,
          "length": 1
        },
        "description": "Begin clone operation"
      }
    },
    {
      "readSegment": {
        "segments": ["channels", "settings"],
        "startChunk": {
          "send": ["S", "address", "segment.chunkSize"],
          "receive": {
            "type": "pattern",
            "pattern": [
              "X",                           // Literal 'X' (0x58) - 1 byte
              { "field": "address", "size": 2 },  // Address (high + low) - 2 bytes
              { "field": "length", "size": 1 },   // Length - 1 byte
              { "field": "data", "size": 0 }      // Data (variable size) - rest of response
            ],
            "dataLength": "segment.chunkSize"
          }
        },
        "endChunk": {
          "send": [0x06],
          "receive": {
            "type": "exact",
            "value": 0x06,
            "length": 1
          }
        },
        "description": "Read all memory segments"
      }
    }
  ]
}
```

## Write Protocol Example

```json
{
  "writeMemory": [
    {
      "sendReceive": {
        "send": [0x50, 0xbb, 0xff, 0x20, 0x12, 0x07, 0x25],
        "receive": {
          "type": "exact",
          "value": 0x06,
          "length": 1
        }
      }
    },
    {
      "writeSegment": {
        "segments": ["channels", "settings"],
        "send": ["X", "segment.startAddress", "segment.chunkSize"],
        "data": "segment.data",
        "receive": {
          "type": "exact",
          "value": 0x06,
          "length": 1
        },
        "description": "Write all memory segments"
      }
    }
  ]
}
```

## Data Types and Expressions

### Literal Values
- **Numbers**: `123`, `0x1a`, `0b1010`
- **Strings**: `"hello"`, `'world'`
- **Arrays**: `[1, 2, 3]`, `[0x50, 0xbb]`
- **Booleans**: `true`, `false`

### Variables
- **Reference**: `"$variableName"`
- **Assignment**: `"variableName = expression"`

### Expressions
- **Arithmetic**: `"nextAddress + 64"`
- **Bitwise**: `"address >> 8"`, `"address & 0xff"`
- **Comparison**: `"address > 0x17ff"`
- **Logical**: `"condition1 && condition2"`

### Special Values
- **Dynamic**: `"address"` (current address being processed, automatically formatted as needed)
- **Received**: `"receivedData"` (last received data)
- **Segment**: `"segment.data"` (current segment data)
- **Segment Properties**: `"segment.startAddress"`, `"segment.endAddress"`, `"segment.chunkSize"` (current segment properties)

## Receive Pattern Types

### 1. Exact Match
```json
{
  "type": "exact",
  "value": 0x06,
  "length": 1
}
```

### 2. Variable Length
```json
{
  "type": "variable",
  "length": 8
}
```

### 3. Pattern Match
```json
{
  "type": "pattern",
  "pattern": [
    "X",                           // Literal value (1 byte)
    { "field": "address", "size": 2 },  // 2-byte address
    { "field": "length", "size": 1 },   // 1-byte length
    { "field": "data", "size": 0 }      // Variable data (rest of response)
  ]
}
```

**Pattern Elements:**
- **Literal Values**: `string` or `number` - Fixed values that must match exactly (1 byte each)
- **Fields**: `{ field: string; size: number }` - Variable data with specified size
  - `size: 0` indicates variable-length data (rest of response)
  - `size: n` indicates exactly n bytes for fixed-size fields

**Data Length:**
- The length of the data portion (where `size: 0`) is always determined by the segment configuration (e.g., `chunkSize`).
- There is no `dataLength` property in the pattern definition; the driver will use the segment's chunk size for the data portion.

**Examples:**
- **Baofeng UV-5R**: `[X][address_2bytes][length_1byte][data...]` (data length = segment.chunkSize)
- **Alternative Format**: `[0xFF][address_3bytes][length_2bytes][data...]` (data length = segment.chunkSize)
- **Simple Protocol**: `[ACK][data...]` (data length = segment.chunkSize)

### 4. Any Value
```json
{
  "type": "any",
  "length": 1
}
```

## Enhanced Pattern Format Benefits

The new placeholder format with variable sizes provides several advantages:

1. **Generic Support**: Works with any radio protocol format, not just specific radio types
2. **Flexible Placeholders**: Each placeholder can have a different size (1 byte, 2 bytes, 3 bytes, etc.)
3. **Self-Documenting**: Protocol definition clearly shows the expected response format
4. **Extensible**: New radio types can be added without code changes
5. **Backward Compatible**: Existing protocols can be migrated incrementally

### Migration from Old Format

**Before (Radio-specific):**
```json
"pattern": ["X", "address", "length", "data"]
```

**After (Generic):**
```json
"pattern": [
  "X",
  { "field": "address", "size": 2 },
  { "field": "length", "size": 1 },
  { "field": "data", "size": 0 }
]
```

The old format assumed all placeholders were 1 byte each, which was too restrictive for different radio protocols.

## Implementation Architecture

### 1. Protocol Interpreter

```typescript
interface ProtocolInterpreter {
  executeProtocol(protocol: RadioProtocol, context: ProtocolContext): Promise<void>;
  executeStep(step: ProtocolStep, context: ProtocolContext): Promise<void>;
}
```

### 2. Protocol Context

```typescript
interface ProtocolContext {
  port: SerialPort;
  variables: Map<string, any>;
  receivedData: Uint8Array;
  currentSegment?: RadioMemorySegment;
  logger: ILogLayer;
}
```

### 3. Step Executors

```typescript
interface StepExecutor {
  canExecute(step: ProtocolStep): boolean;
  execute(step: ProtocolStep, context: ProtocolContext): Promise<void>;
}
```

### 4. Generic Driver

```typescript
class GenericRadioDriver extends RadioSegmentedMemoryDriver {
  private protocol: RadioProtocol;

  constructor(radioModel: RadioModelId, logger: ILogLayer, protocol: RadioProtocol) {
    super(radioModel, logger);
    this.protocol = protocol;
  }

  protected async readSegment(port: SerialPort): Promise<RadioMemorySegment | null> {
    // Execute readSegment step from protocol
  }

  protected async writeSegment(port: SerialPort, segment: RadioMemorySegment): Promise<void> {
    // Execute writeSegment step from protocol
  }
}
```

## Command-Specific Logic

### Read Segment Command
The `readSegment` command handles:
- Iterating through all memory segments in order
- Managing address transitions between segments
- Handling the start/end chunk protocol for each segment
- Returning `null` when all segments are complete

### Write Segment Command
The `writeSegment` command handles:
- Iterating through all memory segments in order
- Sending segment data with proper addressing
- Managing acknowledgments for each segment
- Handling completion when all segments are written

## Benefits

1. **Radio Independence**: Single driver implementation supports multiple radio types
2. **Declarative**: Protocol logic is defined in configuration, not code
3. **Maintainable**: Protocol changes don't require code changes
4. **Testable**: Protocol definitions can be unit tested independently
5. **Extensible**: New radio types can be added without code changes
6. **Documentation**: Protocol is self-documenting through JSON structure
7. **Simplified**: No explicit loop constructs needed - commands handle iteration internally
8. **Generic Patterns**: Variable-sized placeholders support any radio protocol format
9. **Flexible**: Each protocol can define its own response structure with explicit sizes

## Migration Strategy

1. **Phase 1**: Create DSL specification and interpreter
2. **Phase 2**: Convert Baofeng driver to use DSL
3. **Phase 3**: Add support for additional radio types
4. **Phase 4**: Deprecate hard-coded drivers

## Future Enhancements

1. **Validation**: JSON schema validation for protocol definitions
2. **Visual Editor**: GUI for creating protocol definitions
3. **Protocol Library**: Repository of radio protocol definitions
4. **Versioning**: Protocol version management and migration
5. **Testing Framework**: Automated protocol testing and validation
