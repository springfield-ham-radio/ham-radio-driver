import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { ReadExecutor } from "../../../src/executors/read-executor.js";
import { ProtocolContextFactory } from "../utils/test-factories.js";
import type { ProtocolContext } from "../../../src/protocol-context.js";

const thD74LogPath = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/kenwood-th-d74-block-0x01ea-serial.json");

class MockPort extends EventEmitter {
  public writes: Uint8Array[] = [];
  private dataChunks = 0;

  write = (data: Uint8Array, callback?: (error?: Error | null) => void): boolean => {
    this.writes.push(Uint8Array.from(data));
    const isAck = data.length === 1 && data[0] === 0x06;

    setImmediate(() => {
      if (isAck) {
        this.emit("data", Buffer.from([0x06]));
        return;
      }

      const address = this.dataChunks * 8;
      this.dataChunks += 1;
      this.emit(
        "data",
        Buffer.from([0x57, (address >> 8) & 0xff, address & 0xff, 8, 1, 2, 3, 4, 5, 6, 7, 8]),
      );
    });

    callback?.(null);
    return true;
  };
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

  it("(a) completes when the ack byte arrives during a delayed write callback", async () => {
    const payload = Uint8Array.from({ length: 256 }, (_, index) => index & 0xff);
    const port = new DelayedAckPort({
      ackWriteDelayMs: 5,
      frames: [
        Buffer.from([0x57, 0x00, 0x00, 0x00, 0x00, ...payload]),
        Buffer.from([0x57, 0x01, 0x00, 0x00, 0x00, ...payload]),
      ],
    });
    context.port = port as never;
    context.portReceiveState = undefined;
    context.memoryBuffer = new Uint8Array(512);
    context.memoryConfig = {
      addressEndianness: "big",
      addressSize: 2,
      chunkSize: 256,
      segments: {
        image: { endAddress: 0x01ff, startAddress: 0x0000 },
      },
    };

    const executor = new ReadExecutor();
    const step = {
      description: "Read memory",
      read: {
        ack: {
          expect: "0x06",
          send: ["0x06"],
          timeout: 200,
        },
        expect: ["W", "$address", 0x00, 0x00, "$data"],
        ready: "0x06",
        segments: ["image"],
        send: ["R", "$address", "$chunkSize"],
        timeout: 1000,
      },
    } as RadioProtocolStep;

    await executor.execute(step, context);

    expect(context.memoryBuffer.slice(256, 256 + 8)).toEqual(payload.slice(0, 8));
  });

  it("(b) feeds surplus bytes from a combined ack and payload into the next frame", async () => {
    const payload = Uint8Array.from({ length: 8 }, (_, index) => index + 1);
    const frame = (address: number): Buffer =>
      Buffer.from([0x58, (address >> 8) & 0xff, address & 0xff, payload.length, ...payload]);
    const combined = Buffer.concat([Buffer.from([0x06]), frame(8)]);
    const port = new ScriptedPort([frame(0), combined, Buffer.from([0x06])]);
    context.port = port as never;
    context.portReceiveState = undefined;

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

    expect(context.memoryBuffer.slice(0, 8)).toEqual(payload);
    expect(context.memoryBuffer.slice(8, 16)).toEqual(payload);
  });

  it("(c) consumes a ready byte from residue after a late ack timeout", async () => {
    const payload = Uint8Array.from({ length: 8 }, (_, index) => index + 10);
    const frame = (address: number): Buffer =>
      Buffer.from([0x58, (address >> 8) & 0xff, address & 0xff, payload.length, ...payload]);
    const port = new ScriptedPort([frame(0), undefined, Buffer.concat([Buffer.from([0x06]), frame(8)]), undefined]);
    context.port = port as never;
    context.portReceiveState = undefined;

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

    expect(context.memoryBuffer.slice(0, 8)).toEqual(payload);
    expect(context.memoryBuffer.slice(8, 16)).toEqual(payload);
  });

  it("(d) replays TH-D74 log entries 985-990 for block 0x01EA", async () => {
    const log = JSON.parse(readFileSync(thD74LogPath, "utf8")) as {
      entries: Array<{ direction: string; data: number[] }>;
    };
    const blockEaFrame = Buffer.from(log.entries[2].data);
    const port = new ScriptedPort([blockEaFrame, Buffer.from([0x06])]);
    context.port = port as never;
    context.portReceiveState = undefined;
    context.memoryBuffer = new Uint8Array(256);
    context.memoryConfig = {
      addressEndianness: "big",
      addressSize: 2,
      chunkSize: 256,
      segments: {
        image: { endAddress: 0x02e9, startAddress: 0x01ea },
      },
    };

    const executor = new ReadExecutor();
    const step = {
      description: "Read memory",
      read: {
        ack: {
          expect: "0x06",
          send: ["0x06"],
          timeout: 200,
        },
        expect: ["W", "$address", 0x00, 0x00, "$data"],
        ready: "0x06",
        segments: ["image"],
        send: ["R", "$address", "$chunkSize"],
        timeout: 1000,
      },
    } as RadioProtocolStep;

    await executor.execute(step, context);

    const expectedPayload = Uint8Array.from(blockEaFrame).slice(5);
    expect(context.memoryBuffer.slice(0, expectedPayload.length)).toEqual(expectedPayload);
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
    const response = this.responses.shift();

    if (response) {
      setImmediate(() => {
        this.emit("data", response);
      });
    }

    callback?.(null);
    return true;
  };
}

class DelayedAckPort extends EventEmitter {
  readonly writes: Uint8Array[] = [];
  private readonly ackWriteDelayMs: number;
  private readonly frames: Buffer[];
  private exchange = 0;

  constructor(options: { ackWriteDelayMs: number; frames: Buffer[] }) {
    super();
    this.ackWriteDelayMs = options.ackWriteDelayMs;
    this.frames = options.frames;
  }

  write = (data: Uint8Array, callback?: (error?: Error | null) => void): boolean => {
    this.writes.push(Uint8Array.from(data));
    const current = this.exchange;
    this.exchange += 1;

    const isAck = data.length === 1 && data[0] === 0x06;

    if (isAck) {
      this.emit("data", Buffer.from([0x06]));
      setTimeout(() => {
        callback?.(null);
      }, this.ackWriteDelayMs);
      return true;
    }

    const frame = this.frames[Math.floor(current / 2)];

    setImmediate(() => {
      this.emit("data", frame);
      callback?.(null);
    });
    return true;
  };
}

class LogReplayPort extends EventEmitter {
  readonly writes: Uint8Array[] = [];
  private readonly script: Array<{ direction: string; data: Uint8Array }>;
  private readonly verifySends: Set<number>;
  private cursor = 0;
  private sendCount = 0;

  constructor(script: Array<{ direction: string; data: Uint8Array }>, options?: { verifySends?: number[] }) {
    super();
    this.script = script;
    this.verifySends = new Set(options?.verifySends ?? script.map((_, index) => index));
  }

  write = (data: Uint8Array, callback?: (error?: Error | null) => void): boolean => {
    this.writes.push(Uint8Array.from(data));
    const expected = this.script[this.cursor];

    if (expected?.direction !== "SEND") {
      throw new Error(`Unexpected write at script index ${this.cursor}`);
    }

    if (this.verifySends.size > 0 && this.verifySends.has(this.sendCount)) {
      expect(Array.from(data)).toEqual(Array.from(expected.data));
    }

    this.sendCount += 1;
    this.cursor += 1;

    const response = this.script[this.cursor];
    if (response?.direction === "RECV") {
      setImmediate(() => {
        this.emit("data", Buffer.from(response.data));
      });
      this.cursor += 1;
    }

    callback?.(null);
    return true;
  };
}
