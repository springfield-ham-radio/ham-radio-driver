import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { RadioModelId, type Radio } from '@springfield/ham-radio-api';
import { ProtocolInterpreter } from '@src/protocol-interpreter.js';
import { CancelledException } from '@src/cancelled-exception.js';
import type { ProtocolContext } from '@src/protocol-context.js';
import { ON_ERROR_CLEANUP_BUDGET_MS, runProtocolOnErrorCleanup } from '@src/utils/protocol-on-error.js';
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

function baseProtocol(overrides: Partial<Radio> = {}): Radio {
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

  it('uses the onError list for the operation that failed', async () => {
    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      writeMemory: [{ send: [0x02], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: ['E'] }],
        writeMemory: [{ send: ['W'] }],
      },
    });

    await expect(new ProtocolInterpreter(createContext(mock.port)).executeProtocol(protocol, 'readMemory')).rejects.toThrow(
      /Timeout waiting for response/,
    );
    expect(writePayloads(mock.writes)).toContain(0x45);
    expect(writePayloads(mock.writes)).not.toContain('W'.charCodeAt(0));

    mock = createMockPort();
    await expect(new ProtocolInterpreter(createContext(mock.port)).executeProtocol(protocol, 'writeMemory')).rejects.toThrow(
      /Timeout waiting for response/,
    );
    expect(writePayloads(mock.writes)).toContain('W'.charCodeAt(0));
    expect(writePayloads(mock.writes)).not.toContain(0x45);
  });

  it('skips non-exchange cleanup steps and still sends a later exchange', async () => {
    const warn = vi.fn();
    const context = createContext(mock.port);
    context.logger.warn = warn;

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ read: { segments: ['channel'] } } as never, { send: ['E'] }],
      },
    });

    await expect(new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);

    expect(warn.mock.calls.some((call) => String(call[0]).includes('skipped non-exchange step'))).toBe(true);
    expect(writePayloads(mock.writes)).toContain(0x45);
  });

  it('sends later cleanup bytes when cancel flips true during cleanup', async () => {
    const progress = RadioProgressIndicatorFactory.build({ isCanceled: false });

    mock.port.write = (data, callback) => {
      mock.writes.push(data instanceof Uint8Array ? data : new Uint8Array(data));

      if (data[0] === 0x11) {
        progress.isCanceled = true;
      }

      callback?.();
    };

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: [0x11] }, { send: ['E'] }],
      },
    });

    await expect(new ProtocolInterpreter(createContext(mock.port, progress)).executeProtocol(protocol, 'readMemory')).rejects.toThrow(
      /Timeout waiting for response/,
    );

    expect(progress.isCanceled).toBe(true);
    expect(writePayloads(mock.writes)).toContain(0x45);
  });

  it('skips remaining cleanup steps after the port closes', async () => {
    const debug = vi.fn();
    const context = createContext(mock.port);
    context.logger.debug = debug;

    mock.port.write = (data, callback) => {
      mock.writes.push(data instanceof Uint8Array ? data : new Uint8Array(data));

      if (data[0] === 0x11) {
        mock.port.isOpen = false;
      }

      callback?.();
    };

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: [0x11] }, { send: ['E'] }],
      },
    });

    await expect(new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);

    expect(writePayloads(mock.writes)).not.toContain(0x45);
    expect(debug.mock.calls.some((call) => String(call[0]).includes('serial port is closed'))).toBe(true);
    expect(context.inCleanup).toBe(false);
  });

  it('rethrows the original error when cleanup logging throws and still runs later steps', async () => {
    const context = createContext(mock.port);
    context.logger.warn = () => {
      throw new Error('logger exploded');
    };

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: [0x99], expect: { bytes: 1 }, timeout: 1 }, { send: ['E'] }],
      },
    });

    await expect(new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);
    expect(writePayloads(mock.writes)).toContain(0x45);
    expect(context.inCleanup).toBe(false);
  });

  it('does not recurse when cleanup is re-entered', async () => {
    const context = createContext(mock.port);
    let reentered = false;

    mock.port.write = (data, callback) => {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      mock.writes.push(bytes);
      callback?.();

      if (bytes[0] === 0x11 && !reentered) {
        reentered = true;
        void runProtocolOnErrorCleanup(context, [{ send: ['E'] }]);
      }
    };

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ send: [0x11] }, { send: ['E'] }],
      },
    });

    await expect(new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);

    expect(reentered).toBe(true);
    expect(writePayloads(mock.writes).filter((byte) => byte === 0x45)).toHaveLength(1);
    expect(context.inCleanup).toBe(false);
  });

  it('stops a wedged cleanup write at the budget and rethrows the original error', async () => {
    vi.useFakeTimers();

    try {
      const warn = vi.fn();
      const context = createContext(mock.port);
      context.logger.warn = warn;

      mock.port.write = function (data: Uint8Array, _callback?: (error?: Error | null) => void) {
        mock.writes.push(data instanceof Uint8Array ? data : new Uint8Array(data));
      };

      const protocol = baseProtocol({
        readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 20 }],
        onError: {
          readMemory: [{ send: [0x11] }, { send: ['E'] }],
        },
      });

      const pending = new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory');
      const assertion = expect(pending).rejects.toThrow(/Timeout waiting for response/);

      await vi.advanceTimersByTimeAsync(20);
      await vi.advanceTimersByTimeAsync(ON_ERROR_CLEANUP_BUDGET_MS);
      await assertion;

      expect(warn).toHaveBeenCalledWith('onError cleanup stopped: time budget exceeded');
      expect(writePayloads(mock.writes)).toContain(0x11);
      expect(writePayloads(mock.writes)).not.toContain(0x45);
      expect(context.inCleanup).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues cleanup when setBaudRate rejects and still sends the following byte', async () => {
    const warn = vi.fn();
    const context = createContext(mock.port);
    context.logger.warn = warn;
    mock.port.update = async () => {
      throw new Error('baud update failed');
    };

    const protocol = baseProtocol({
      readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 1 }],
      onError: {
        readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
      },
    });

    await expect(new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory')).rejects.toThrow(/Timeout waiting for response/);

    expect(writePayloads(mock.writes)).toContain(0x45);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('baud update failed'))).toBe(true);
    expect(context.inCleanup).toBe(false);
  });

  it('stops cleanup when setBaudRate never settles and does not send the following byte', async () => {
    vi.useFakeTimers();

    try {
      const context = createContext(mock.port);
      mock.port.update = () => new Promise(() => undefined);

      const protocol = baseProtocol({
        readMemory: [{ send: [0x01], expect: { bytes: 1 }, timeout: 20 }],
        onError: {
          readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
        },
      });

      const pending = new ProtocolInterpreter(context).executeProtocol(protocol, 'readMemory');
      const assertion = expect(pending).rejects.toThrow(/Timeout waiting for response/);

      await vi.advanceTimersByTimeAsync(20);
      await vi.advanceTimersByTimeAsync(ON_ERROR_CLEANUP_BUDGET_MS);
      await assertion;

      expect(mock.baudUpdates).toEqual([]);
      expect(writePayloads(mock.writes)).not.toContain(0x45);
      expect(context.inCleanup).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
