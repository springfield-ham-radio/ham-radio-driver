import { describe, expect, it } from "vitest";
import { EventEmitter } from "events";
import { CatWriteExecutor } from "../../../src/executors/cat-write-executor.js";
import { ProtocolContextFactory } from "../utils/test-factories.js";
import { packKenwoodThF6Record } from "../../../src/utils/kenwood-th-f6-cat.js";

const occupiedSpec = {
  freq: 146_520_000,
  offset: 0,
  tuningStep: 0,
  duplex: 0,
  reverse: 0,
  toneMode: 1,
  ctcssMode: 0,
  dtcsMode: 0,
  rtone: 8,
  ctone: 8,
  dtcsCode: 0,
  mode: 0,
  skip: 0,
  split: false,
};

type MockReply = string | ((command: string) => string);

class MockCatPort extends EventEmitter {
  public writes: string[] = [];

  constructor(private readonly replyFor: (command: string) => MockReply = () => "0") {
    super();
  }

  write(data: Uint8Array): boolean {
    const text = Buffer.from(data).toString("ascii");
    this.writes.push(text);

    setImmediate(() => {
      const reply = this.replyFor(text);
      const line = typeof reply === "function" ? reply(text) : reply;
      this.emit("data", Buffer.from(`${line}\r`));
    });

    return true;
  }
}

const buildContext = (memoryBuffer: Uint8Array, port: MockCatPort, count: number) =>
  ProtocolContextFactory.build({
    memoryBuffer,
    memoryConfig: {
      addressEndianness: "big",
      addressSize: 2,
      chunkSize: 32,
      segments: {
        channels: { endAddress: memoryBuffer.length - 1, startAddress: 0 },
      },
    },
    port: port as never,
    progressIndicator: { isCanceled: false, setValue: () => undefined },
    totalProgressUnits: count,
    completedProgressUnits: 0,
  });

const catWriteStep = (count: number) => ({
  catWrite: {
    count,
    pack: "kenwood-th-f6" as const,
    recordSize: 32,
    segment: "channels",
    timeout: 500,
  },
});

describe("CatWriteExecutor", () => {
  it("writes occupied memories and deletes empty slots", async () => {
    const port = new MockCatPort((command) => (command === "MW 0,001\r" ? "MW" : "0"));
    const occupied = packKenwoodThF6Record(occupiedSpec, "CALL");
    const memoryBuffer = new Uint8Array(64).fill(255);
    memoryBuffer.set(occupied, 0);

    const executor = new CatWriteExecutor();
    await executor.execute(
      {
        description: "Write memories via live CAT",
        ...catWriteStep(2),
      },
      buildContext(memoryBuffer, port, 2),
    );

    expect(port.writes[0]).toMatch(/^MW 0,000,/);
    expect(port.writes).toContain("MNA 000,CALL\r");
    expect(port.writes).toContain("MW 0,001\r");
  });

  it("fails the write when the radio rejects a memory and still attempts other channels", async () => {
    const port = new MockCatPort((command) => {
      if (command.startsWith("MW 0,105,")) {
        return "N";
      }

      return "0";
    });
    const occupied = packKenwoodThF6Record(occupiedSpec, "WX");
    const memoryBuffer = new Uint8Array(106 * 32).fill(255);
    memoryBuffer.set(occupied, 0);
    memoryBuffer.set(occupied, 105 * 32);

    const executor = new CatWriteExecutor();

    await expect(executor.execute(catWriteStep(106), buildContext(memoryBuffer, port, 106))).rejects.toThrow(
      "Radio rejected channels 105",
    );

    expect(port.writes).toContain("MNA 000,WX\r");
    expect(port.writes.some((write) => write.startsWith("MW 0,105,"))).toBe(true);
    expect(port.writes.some((write) => write.startsWith("MNA 105,"))).toBe(false);
  });

  it("fails when MNA is rejected after a successful MW", async () => {
    const port = new MockCatPort((command) => (command.startsWith("MNA 000,") ? "N" : "0"));
    const occupied = packKenwoodThF6Record(occupiedSpec, "CALL");
    const memoryBuffer = new Uint8Array(32).fill(255);
    memoryBuffer.set(occupied, 0);

    const executor = new CatWriteExecutor();

    await expect(executor.execute(catWriteStep(1), buildContext(memoryBuffer, port, 1))).rejects.toThrow(
      /0 \(MNA replied N\)/,
    );
  });

  it("fails when split MW is rejected after MW and MNA succeed", async () => {
    const splitSpec = {
      ...occupiedSpec,
      freq: 146_520_000,
      offset: 146_940_000,
      duplex: 3,
      split: true,
      toneMode: 0,
    };
    const port = new MockCatPort((command) => (command.startsWith("MW 1,") ? "N" : "0"));
    const occupied = packKenwoodThF6Record(splitSpec, "SPL");
    const memoryBuffer = new Uint8Array(32).fill(255);
    memoryBuffer.set(occupied, 0);

    const executor = new CatWriteExecutor();

    await expect(executor.execute(catWriteStep(1), buildContext(memoryBuffer, port, 1))).rejects.toThrow(
      /0 \(MW split replied N\)/,
    );

    expect(port.writes.some((write) => write.startsWith("MW 1,"))).toBe(true);
  });
});
