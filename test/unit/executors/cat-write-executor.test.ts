import { describe, it } from "node:test";
import { expect } from "chai";
import { EventEmitter } from "events";
import { CatWriteExecutor } from "../../../src/executors/cat-write-executor.js";
import { ProtocolContextFactory } from "../utils/test-factories.js";
import { packKenwoodThF6Record } from "../../../src/utils/kenwood-th-f6-cat.js";

class MockCatPort extends EventEmitter {
  public writes: string[] = [];

  write(data: Uint8Array): boolean {
    this.writes.push(Buffer.from(data).toString("ascii"));
    setImmediate(() => {
      this.emit("data", Buffer.from("N\r"));
    });
    return true;
  }
}

describe("CatWriteExecutor", () => {
  it("writes occupied memories and deletes empty slots", async () => {
    const port = new MockCatPort();
    const occupied = packKenwoodThF6Record(
      {
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
      },
      "CALL",
    );
    const memoryBuffer = new Uint8Array(64).fill(255);
    memoryBuffer.set(occupied, 0);

    const context = ProtocolContextFactory.build({
      memoryBuffer,
      memoryConfig: {
        addressEndianness: "big",
        addressSize: 2,
        chunkSize: 32,
        segments: {
          channels: { endAddress: 63, startAddress: 0 },
        },
      },
      port: port as never,
      progressIndicator: { isCanceled: false, setValue: () => undefined },
      totalProgressUnits: 2,
      completedProgressUnits: 0,
    });

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
      context,
    );

    expect(port.writes[0]).to.match(/^MW 0,000,/);
    expect(port.writes).to.include("MNA 000,CALL    \r");
    expect(port.writes).to.include("MW 0,001\r");
  });
});
