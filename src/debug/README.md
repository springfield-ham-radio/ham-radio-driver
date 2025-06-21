# Debug Import Script

This directory contains a debug import script that uses the DSL-based `RadioDriver` to read radio memory from a JSON configuration file.

## Usage

```bash
# Build the project first
yarn build

# Run the import script
node dist/debug/import.js <serial-port> <radio-config-file>
```

### Parameters

- `<serial-port>`: The serial port path (e.g., `/dev/ttyUSB0` on Linux, `COM3` on Windows, `/dev/tty.usbserial-*` on macOS)
- `<radio-config-file>`: Path to a JSON file containing the radio configuration

### Example

```bash
node dist/debug/import.js /dev/ttyUSB0 src/debug/baofeng-uv5r-config.json
```

## Output

The script will:

1. Load the radio configuration from the JSON file
2. Connect to the radio via serial port
3. Execute the read memory protocol defined in the configuration
4. Save the raw memory data to a timestamped `.bin` file
5. Save a hex dump to a timestamped `.hex` file
6. Display the first 64 bytes of memory as hex for verification

## Radio Configuration Format

The radio configuration file should contain a JSON object with the following structure:

```json
{
  "id": {
    "model": "radio-model-id",
    "name": "Radio Name",
    "manufacturer": "Manufacturer"
  },
  "settingsSchema": {
    "model": "radio-model-id",
    "settingsSchema": {},
    "channelSchema": {}
  },
  "serialConfig": {
    "baudRate": 9600,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  },
  "memoryConfig": {
    "chunkSize": 64,
    "segments": {
      "channels": {
        "startAddress": 0,
        "endAddress": 6143
      },
      "settings": {
        "startAddress": 7872,
        "endAddress": 8191
      }
    }
  },
  "readMemory": [
    // Protocol steps for reading memory
  ],
  "writeMemory": [
    // Protocol steps for writing memory
  ]
}
```

## Sample Configuration

See `baofeng-uv5r-config.json` for a complete example configuration for the Baofeng UV-5R radio.

## Protocol DSL

The `readMemory` and `writeMemory` arrays contain protocol steps that define how to communicate with the radio. Each step can be one of:

- `sendReceive`: Send data and receive a response
- `readSegment`: Read memory segments in chunks
- `writeSegment`: Write memory segments in chunks

See the main project documentation for detailed information about the protocol DSL syntax.
