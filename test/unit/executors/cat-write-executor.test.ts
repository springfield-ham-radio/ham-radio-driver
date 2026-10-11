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

const catWriteAck = "0";

class MockCatPort extends EventEmitter {
  public writes: string[] = [];

  constructor(private readonly rejectMemoryWriteIndexes = new Set<number>()) {
    super();
  }

  write(data: Uint8Array): boolean {
    const text = Buffer.from(data).toString("ascii");
    this.writes.push(text);

    setImmediate(() => {
      const memoryMatch = /^MW 0,(\d{3})(?:,|\r)/.exec(text);

      if (memoryMatch) {
        const index = Number.parseInt(memoryMatch[1] ?? "0", 10);

        if (this.rejectMemoryWriteIndexes.has(index)) {
          this.emit("data", Buffer.from("N\r"));
          return;
        }
      }

      this.emit("data", Buffer.from(`${catWriteAck}\r`));
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

describe("CatWriteExecutor", () => {
  it("writes occupied memories and deletes empty slots", async () => {
    const port = new MockCatPort();
    const occupied = packKenwoodThF6Record(occupiedSpec, "CALL");
    const memoryBuffer = new Uint8Array(64).fill(255);
    memoryBuffer.set(occupied, 0);

    const executor = new CatWriteExecutor();
    await executor.execute(
      {
        description: "Write memories via live CAT",
        catWrite: {
          count: 2,
          pack: "kenwood-th-f6",
          recordSize: 32,
          segment: "channels",
          timeout: 500,
        },
      },
      buildContext(memoryBuffer, port, 2),
    );

    expect(port.writes[0]).toMatch(/^MW 0,000,/);
    expect(port.writes).toContain("MNA 000,CALL\r");
    expect(port.writes).toContain("MW 0,001\r");
  });

  it("fails the write when the radio rejects a memory and still attempts other channels", async () => {
    const port = new MockCatPort(new Set([105]));
    const occupied = packKenwoodThF6Record(occupiedSpec, "WX");
    const memoryBuffer = new Uint8Array(106 * 32).fill(255);
    memoryBuffer.set(occupied, 0);
    memoryBuffer.set(occupied, 105 * 32);

    const executor = new CatWriteExecutor();

    await expect(
      executor.execute(
        {
          catWrite: {
            count: 106,
            pack: "kenwood-th-f6",
            recordSize: 32,
            segment: "channels",
            timeout: 500,
          },
        },
        buildContext(memoryBuffer, port, 106),
      ),
    ).rejects.toThrow("Radio rejected channels 105");

    expect(port.writes).toContain("MNA 000,WX\r");
    expect(port.writes.some((write) => write.startsWith("MW 0,105,"))).toBe(true);
    expect(port.writes.some((write) => write.startsWith("MNA 105,"))).toBe(false);
  });
});
