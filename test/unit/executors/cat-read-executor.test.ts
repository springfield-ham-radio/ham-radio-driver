import { describe, it } from "node:test";
import { expect } from "chai";
import { EventEmitter } from "events";
import { CatReadExecutor } from "../../../src/executors/cat-read-executor.js";
import { ProtocolContextFactory } from "../utils/test-factories.js";

class MockCatPort extends EventEmitter {
  public writes: string[] = [];

  write(data: Uint8Array): boolean {
    const text = Buffer.from(data).toString("ascii");
    this.writes.push(text);

    setImmediate(() => {
      if (text.startsWith("MR 0,000")) {
        this.emit("data", Buffer.from("MR 0,000,00146520000,0,0,0,1,0,0,8,8,000,000000000,0,0\r"));
        return;
      }

      if (text.startsWith("MNA 000")) {
        this.emit("data", Buffer.from("MNA 000,CALL\r"));
        return;
      }

      this.emit("data", Buffer.from("N\r"));
    });

    return true;
  }
}

describe("CatReadExecutor", () => {
  it("packs occupied CAT memories and fills empty slots with 0xFF", async () => {
    const port = new MockCatPort();
    const memoryBuffer = new Uint8Array(64).fill(0);
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

    const executor = new CatReadExecutor();
    await executor.execute(
      {
        description: "Read memories via live CAT",
        catRead: {
          count: 2,
          pack: "kenwood-th-f6",
          recordSize: 32,
          segment: "channels",
          timeout: 500,
        },
      },
      context,
    );

    expect(port.writes[0]).to.equal("MR 0,000\r");
    expect(port.writes).to.include("MNA 000\r");
    expect(port.writes).to.include("MR 0,001\r");
    expect(memoryBuffer[0]).to.not.equal(255);
    expect(memoryBuffer[24]).to.equal("C".charCodeAt(0));
    expect(memoryBuffer[32]).to.equal(255);
  });
});
