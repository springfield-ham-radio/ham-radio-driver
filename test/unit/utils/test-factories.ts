import { Factory } from "fishery";
import { EventEmitter } from "events";
import type { ProtocolContext } from "@src/protocol-context.js";
import type { RadioExactReceivePattern, RadioVariableReceivePattern, RadioPatternReceivePattern, RadioAnyReceivePattern, RadioMemoryConfig, RadioMemorySegment, RadioProgressIndicator } from "@springfield/ham-radio-api";

export const ProtocolContextFactory = Factory.define<ProtocolContext>(() => ({
  currentSegment: {
    name: "test-segment",
    currentAddress: 0x1000,
    config: {
      startAddress: 0x1000,
      endAddress: 0x2000,
    },
  },
  memoryConfig: {
    chunkSize: 64,
    segments: {
      "test-segment": {
        startAddress: 0x1000,
        endAddress: 0x2000,
      },
    },
  },
  variables: new Map(),
  port: {
    write: () => {},
    pipe: () => new EventEmitter(),
  } as any,
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as any,
  progressIndicator: {
    isCanceled: false,
  } as any,
  memoryBuffer: new Uint8Array(1024),
  bufferOffset: 0,
}));

export const RadioExactReceivePatternFactory = Factory.define<RadioExactReceivePattern>(() => ({
  type: "exact",
  value: 0x06,
  length: 1,
}));

export const RadioVariableReceivePatternFactory = Factory.define<RadioVariableReceivePattern>(() => ({
  type: "variable",
  length: 4,
}));

export const RadioPatternReceivePatternFactory = Factory.define<RadioPatternReceivePattern>(() => ({
  type: "pattern",
  pattern: [
    "X", // 1 byte
    { field: "address", size: 2 }, // 2 bytes
    { field: "length", size: 1 }, // 1 byte
    { field: "data", size: 0 }, // Variable
  ],
}));

export const RadioAnyReceivePatternFactory = Factory.define<RadioAnyReceivePattern>(() => ({
  type: "any",
  length: 32,
}));

export const RadioMemorySegmentFactory = Factory.define<RadioMemorySegment>(() => ({
  startAddress: 0x1000,
  endAddress: 0x2000,
}));

export const RadioMemoryConfigFactory = Factory.define<RadioMemoryConfig>(() => ({
  chunkSize: 64,
  segments: {
    "test-segment": {
      startAddress: 0x1000,
      endAddress: 0x2000,
    },
  },
}));

export const RadioProgressIndicatorFactory = Factory.define<RadioProgressIndicator>(() => ({
  isCanceled: false,
  setValue: () => {},
}));

export const Uint8ArrayFactory = Factory.define<Uint8Array>(() => new Uint8Array([0x06, 0x01, 0x02, 0x03]));

export const BufferFactory = Factory.define<Buffer>(() => Buffer.from([0x06, 0x01, 0x02, 0x03]));
