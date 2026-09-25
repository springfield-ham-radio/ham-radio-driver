import { beforeEach, describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { ReadExecutor } from "../../../src/executors/read-executor.js";
import { ProtocolContextFactory } from "../utils/test-factories.js";
import type { ProtocolContext } from "../../../src/protocol-context.js";

class MockPort extends EventEmitter {
  public writes: Uint8Array[] = [];
  private dataChunks = 0;

  write = (data: Uint8Array): boolean => {
    this.writes.push(Uint8Array.from(data));
    return true;
  };

  pipe = (): EventEmitter => {
    const parser = new EventEmitter();
    const isPayload = this.writes.length % 2 === 0;

    setImmediate(() => {
      if (isPayload) {
        const address = this.dataChunks * 8;
        this.dataChunks += 1;
        parser.emit(
          "data",
          Buffer.from([0x57, (address >> 8) & 0xff, address & 0xff, 8, 1, 2, 3, 4, 5, 6, 7, 8]),
        );
        return;
      }

      parser.emit("data", Buffer.from([0x06]));
    });

    return parser;
  };

  unpipe = (): void => undefined;
}

describe("ReadExecutor", () => {
  let context: ProtocolContext;
  let port: MockPort;

  beforeEach(() => {
    port = new MockPort();
    context = ProtocolContextFactory.build({
      bufferOffset: 0,
      currentSegment: undefined,
      memoryBuffer: new Uint8Array(16),
      port: port as never,
      progressIndicator: {
        isCanceled: false,
        setValue: () => undefined,
      },
      totalProgressUnits: 2,
    });
    context.memoryConfig = {
      addressEndianness: "big",
      addressSize: 2,
      chunkSize: 8,
      segments: {
        image: { endAddress: 15, startAddress: 0 },
      },
    };
  });

  it("waits after each accepted chunk when delay is set", async () => {
    const executor = new ReadExecutor();
    const step: RadioProtocolStep = {
      description: "Read memory",
      read: {
        ack: {
          expect: "0x06",
          send: ["0x06"],
        },
        delay: 40,
        expect: ["W", "$address", "$chunkSize", "$data"],
        segments: ["image"],
        send: ["R", "$address", "$chunkSize"],
        timeout: 1000,
      },
    };

    const startedAt = Date.now();
    await executor.execute(step, context);
    const elapsedMs = Date.now() - startedAt;

    expect(context.memoryBuffer.slice(0, 8)).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(elapsedMs).toBeGreaterThanOrEqual(80);
  });

  it("prefixes the next frame when the chunk ack times out", async () => {
    const frame = (address: number, payload: number[]): Buffer =>
      Buffer.from([0x58, (address >> 8) & 0xff, address & 0xff, payload.length, ...payload]);
    const port = new ScriptedPort([
      frame(0, [1, 2, 3, 4, 5, 6, 7, 8]),
      undefined,
      Buffer.concat([Buffer.from([0x06]), frame(8, [9, 10, 11, 12, 13, 14, 15, 16])]),
      undefined,
    ]);
    context.port = port as never;

    const executor = new ReadExecutor();
    const step = {
      description: "Read memory",
      read: {
        ack: {
          expect: "0x06",
          send: ["0x06"],
          timeout: 30,
        },
        expect: ["X", "$address", "$length", "$data"],
        ready: "0x06",
        segments: ["image"],
        send: ["S", "$address", "$chunkSize"],
        timeout: 1000,
      },
    } as RadioProtocolStep;

    await executor.execute(step, context);

    expect(Array.from(port.writes[0] ?? [])).toEqual([0x53, 0x00, 0x00, 8]);
    expect(Array.from(port.writes[1] ?? [])).toEqual([0x06]);
    expect(Array.from(port.writes[2] ?? [])).toEqual([0x53, 0x00, 0x08, 8]);
    expect(context.memoryBuffer.slice(0, 16)).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
  });

  it("keeps the next frame plain when the chunk ack arrives", async () => {
    const frame = (address: number, payload: number[]): Buffer =>
      Buffer.from([0x58, (address >> 8) & 0xff, address & 0xff, payload.length, ...payload]);
    const port = new ScriptedPort([frame(0, [1, 2, 3, 4, 5, 6, 7, 8]), Buffer.from([0x06]), frame(8, [9, 10, 11, 12, 13, 14, 15, 16]), Buffer.from([0x06])]);
    context.port = port as never;

    const executor = new ReadExecutor();
    const step = {
      description: "Read memory",
      read: {
        ack: {
          expect: "0x06",
          send: ["0x06"],
          timeout: 200,
        },
        expect: ["X", "$address", "$length", "$data"],
        ready: "0x06",
        segments: ["image"],
        send: ["S", "$address", "$chunkSize"],
        timeout: 1000,
      },
    } as RadioProtocolStep;

    await executor.execute(step, context);

    expect(context.memoryBuffer.slice(0, 16)).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]));
  });
});

class ScriptedPort extends EventEmitter {
  readonly writes: Uint8Array[] = [];
  private readonly responses: Array<Buffer | undefined>;

  constructor(responses: Array<Buffer | undefined>) {
    super();
    this.responses = [...responses];
  }

  write = (data: Uint8Array, callback?: (error?: Error | null) => void): boolean => {
    this.writes.push(Uint8Array.from(data));
    callback?.(null);
    return true;
  };

  pipe = (): EventEmitter => {
    const parser = new EventEmitter();
    const response = this.responses.shift();

    if (response) {
      setImmediate(() => {
        parser.emit("data", response);
      });
    }

    return parser;
  };

  unpipe = (): void => undefined;
}
