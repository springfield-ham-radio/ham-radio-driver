import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
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

    expect(context.memoryBuffer.slice(0, 8)).to.deep.equal(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(elapsedMs).to.be.at.least(80);
  });
});
