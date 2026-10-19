import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { RadioModelId } from '@springfield/ham-radio-api';
import { ProtocolInterpreter } from '@src/protocol-interpreter.js';
import { CancelledException } from '@src/cancelled-exception.js';
import type { ProtocolContext } from '@src/protocol-context.js';
import type { RadioProtocolWithOnError } from '@src/types/protocol-on-error.js';
import { ON_ERROR_CLEANUP_BUDGET_MS } from '@src/utils/protocol-on-error.js';
import { RadioMemoryConfigFactory, RadioProgressIndicatorFactory } from './utils/test-factories.js';

interface MockPortHandle {
  port: EventEmitter & {
    isOpen: boolean;
    write: (data: Uint8Array, callback?: (error?: Error | null) => void) => void;
    update: (options: { baudRate: number }) => Promise<void>;
    pipe: () => EventEmitter;
  };
  writes: Uint8Array[];
  baudUpdates: number[];
}

function createMockPort(isOpen = true): MockPortHandle {
  const writes: Uint8Array[] = [];
  const baudUpdates: number[] = [];

  const port = new EventEmitter() as MockPortHandle['port'];
  port.isOpen = isOpen;
  port.write = (data, callback) => {
    writes.push(data instanceof Uint8Array ? data : new Uint8Array(data));
    callback?.();
  };
  port.update = async ({ baudRate }) => {
    baudUpdates.push(baudRate);
  };
  port.pipe = () => new EventEmitter();

  return { port, writes, baudUpdates };
}

function baseProtocol(overrides: Partial<RadioProtocolWithOnError> = {}): RadioProtocolWithOnError {
  return {
    id: {
      model: RadioModelId('test-radio'),
      name: 'Test',
      manufacturer: 'Test',
    },
    version: '1.0.0',
    description: 'test',
    settingsSchema: {
      model: RadioModelId('test-radio'),
      settingsSchema: {},
      channelSchema: {},
    },
    serialConfig: { baudRate: 9600 },
    memoryConfig: RadioMemoryConfigFactory.build(),
    readMemory: [],
    writeMemory: [],
    ...overrides,
  };
}

function createContext(port: MockPortHandle['port'], progressIndicator = RadioProgressIndicatorFactory.build()): ProtocolContext {
  return {
    bufferOffset: 0,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    memoryBuffer: new Uint8Array(256),
    memoryConfig: RadioMemoryConfigFactory.build(),
    port: port as any,
    progressIndicator,
    variables: new Map(),
  };
}

function writePayloads(writes: Uint8Array[]): number[] {
  return writes.flatMap((chunk) => [...chunk]);
}

describe('ProtocolInterpreter onError cleanup', () => {
  let mock: MockPortHandle;

  beforeEach(() => {
    mock = createMockPort();
  });

  afterEach(() => {
    mock.port.removeAllListeners();
  });

  it('runs onError after a step failure and rethrows the original error', async () => {
    const protocol = baseProtocol({
      readMemory: [
        { send: [0x01] },
        { send: [0x02], expect: { bytes: 1 }, timeout: 1 },
      ],
      onError: {
        readMemory: [{ send: ['E'] }],
      },
    });

    const interpreter = new ProtocolInterpreter(createContext(mock.port));

    await expect(interpreter.executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);

    expect(writePayloads(mock.writes)).toContain(0x45);
    expect(writePayloads(mock.writes).filter((byte) => byte === 0x45)).toHaveLength(1);
  });

  it('does not run onError when all steps succeed', async () => {
    const protocol = baseProtocol({
      readMemory: [{ send: [0x01] }, { send: [0x02] }],
      onError: {
        readMemory: [{ send: ['E'] }],
      },
    });

    const interpreter = new ProtocolInterpreter(createContext(mock.port));

    await interpreter.executeProtocol(protocol, 'readMemory');

    expect(writePayloads(mock.writes)).not.toContain(0x45);
  });

  it('ignores missing onError and an empty list', async () => {
    const failing = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
    });

    const interpreter = new ProtocolInterpreter(createContext(mock.port));

    await expect(interpreter.executeProtocol(failing, 'readMemory')).rejects.toThrow();
    expect(mock.writes).toHaveLength(1);

    mock = createMockPort();
    const emptyOnError = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: { readMemory: [] },
    });

    await expect(new ProtocolInterpreter(createContext(mock.port)).executeProtocol(emptyOnError, 'readMemory')).rejects.toThrow();
    expect(mock.writes).toHaveLength(1);
  });

  it('swallows cleanup errors and still runs later cleanup steps', async () => {
    const warn = vi.fn();
    const portContext = createContext(mock.port);
    portContext.logger.warn = warn;

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [
          { send: [0x99], expect: { bytes: 1 }, timeout: 1 },
          { send: ['E'] },
        ],
      },
    });

    const interpreter = new ProtocolInterpreter(portContext);

    await expect(interpreter.executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);

    expect(warn).toHaveBeenCalled();
    expect(writePayloads(mock.writes)).toContain(0x45);
  });

  it('runs onError on cancel even when isCanceled is set', async () => {
    const progress = RadioProgressIndicatorFactory.build({ isCanceled: true });

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01] }],
      onError: {
        readMemory: [{ send: ['E'] }],
      },
    });

    const interpreter = new ProtocolInterpreter(createContext(mock.port, progress));

    await expect(interpreter.executeProtocol(protocol, 'readMemory')).rejects.toBeInstanceOf(CancelledException);

    expect(writePayloads(mock.writes)).toContain(0x45);
  });

  it('skips cleanup when the port is closed', async () => {
    mock = createMockPort(false);

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: ['E'] }],
      },
    });

    const interpreter = new ProtocolInterpreter(createContext(mock.port));

    await expect(interpreter.executeProtocol(protocol, 'readMemory')).rejects.toThrow();
    expect(mock.writes).toHaveLength(1);
    expect(writePayloads(mock.writes)).not.toContain(0x45);
  });

  it('runs setBaudRate then E without restoring the open baud', async () => {
    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
      },
    });

    const interpreter = new ProtocolInterpreter(createContext(mock.port));

    await expect(interpreter.executeProtocol(protocol, 'readMemory')).rejects.toThrow();

    expect(mock.baudUpdates).toEqual([57600]);
    expect(mock.baudUpdates).not.toContain(9600);
    expect(writePayloads(mock.writes)).toContain(0x45);
  });

  it('does not advance progress during cleanup', async () => {
    const setValue = vi.fn();
    const progress = RadioProgressIndicatorFactory.build({ setValue });

    const protocol = baseProtocol({
      readMemory: [
        { send: [0x01] },
        { send: [0x02], expect: { bytes: 1 }, timeout: 1 },
      ],
      onError: {
        readMemory: [{ send: ['E'] }],
      },
    });

    const context = createContext(mock.port, progress);
    const interpreter = new ProtocolInterpreter(context);

    await expect(interpreter.executeProtocol(protocol, 'readMemory')).rejects.toThrow();

    expect(context.completedProgressUnits).toBe(1);
    expect(setValue).toHaveBeenCalledTimes(2);
  });

  it('does not recurse into onError when a cleanup step fails', async () => {
    const warn = vi.fn();
    const context = createContext(mock.port);
    context.logger.warn = warn;

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: [0xaa], expect: { bytes: 1 }, timeout: 1 }],
      },
    });

    await expect(new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory')).rejects.toThrow();

    const cleanupWarnings = warn.mock.calls.filter((call) => String(call[0]).includes('onError cleanup step failed'));
    expect(cleanupWarnings).toHaveLength(1);
  });

  it('exports a 1500 ms cleanup budget constant', () => {
    expect(ON_ERROR_CLEANUP_BUDGET_MS).toBe(1500);
  });
});
