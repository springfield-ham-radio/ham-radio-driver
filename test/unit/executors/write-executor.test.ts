import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
import { EventEmitter } from "events";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { WriteExecutor } from "../../../src/executors/write-executor.js";
import { ProtocolContextFactory } from "../utils/test-factories.js";
import type { ProtocolContext } from "../../../src/protocol-context.js";

class MockPort extends EventEmitter {
  public writes: Uint8Array[] = [];

  write = (data: Uint8Array): boolean => {
    this.writes.push(Uint8Array.from(data));
    return true;
  };

  pipe = (): EventEmitter => {
    const parser = new EventEmitter();
    setImmediate(() => {
      parser.emit("data", Buffer.from([0x06]));
    });
    return parser;
  };

  unpipe = (): void => undefined;
}

describe("WriteExecutor", () => {
  let context: ProtocolContext;
  let port: MockPort;

  beforeEach(() => {
    port = new MockPort();
    const channels = new Uint8Array(64);
    channels.forEach((_, index) => {
      channels[index] = index;
    });
    const settings = new Uint8Array(64);
    settings.forEach((_, index) => {
      settings[index] = 0x80 + index;
    });
    const memoryBuffer = new Uint8Array(128);
    memoryBuffer.set(channels, 0);
    memoryBuffer.set(settings, 64);

    context = ProtocolContextFactory.build({
      currentSegment: undefined,
      memoryBuffer,
      port: port as never,
      progressIndicator: {
        isCanceled: false,
        setValue: () => undefined,
      },
      totalProgressUnits: 8,
    });
    context.memoryConfig = {
      addressEndianness: "big",
      addressSize: 2,
      chunkSize: 64,
      segments: {
        channels: { endAddress: 63, startAddress: 0 },
        settings: { endAddress: 191, startAddress: 128 },
      },
    };
  });

  it("writes 16-byte X blocks and skips a hole", async () => {
    const executor = new WriteExecutor();
    const step: RadioProtocolStep = {
      description: "Write memory",
      write: {
        chunkSize: 16,
        expect: "0x06",
        segments: ["channels", "settings"],
        send: ["X", "$address", "$length", "$data"],
        skip: [{ endAddress: 31, startAddress: 16 }],
      },
    };

    await executor.execute(step, context);

    expect(port.writes).to.have.length(7);
    expect(Array.from(port.writes[0] ?? [])).to.deep.equal([0x58, 0x00, 0x00, 16, ...Array.from({ length: 16 }, (_, index) => index)]);
    expect(Array.from(port.writes[1] ?? []).slice(0, 4)).to.deep.equal([0x58, 0x00, 0x20, 16]);
    expect(Array.from(port.writes[3] ?? []).slice(0, 4)).to.deep.equal([0x58, 0x00, 0x80, 16]);
    expect(Array.from(port.writes[3] ?? []).slice(4, 6)).to.deep.equal([0x80, 0x81]);
  });
});
