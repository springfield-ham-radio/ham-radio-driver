import { describe, expect, it } from "vitest";
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
        this.emit("data", Buffer.from("MR 0,000,00146520000,0,0,0,1,0,0,09,09,000,000000000,0,0\r"));
        return;
      }

      if (text.startsWith("MNA 000")) {
        this.emit("data", Buffer.from("MNA 000,CALL\r"));
        return;
      }

      if (text === "APO\r") {
        this.emit("data", Buffer.from("APO 1\r"));
        return;
      }

      if (text === "BAT\r") {
        this.emit("data", Buffer.from("BAT 0\r"));
        return;
      }

      if (text === "SV\r") {
        this.emit("data", Buffer.from("SV 5\r"));
        return;
      }

      if (text === "BAL\r") {
        this.emit("data", Buffer.from("BAL 0\r"));
        return;
      }

      if (text === "MNF\r") {
        this.emit("data", Buffer.from("MNF 0\r"));
        return;
      }

      if (text === "SCR\r") {
        this.emit("data", Buffer.from("SCR 0\r"));
        return;
      }

      if (text === "ATT\r") {
        this.emit("data", Buffer.from("ATT 0\r"));
        return;
      }

      if (text === "ARO\r") {
        this.emit("data", Buffer.from("ARO 1\r"));
        return;
      }

      if (text === "VOX\r") {
        this.emit("data", Buffer.from("VOX 0\r"));
        return;
      }

      if (text === "CNT\r") {
        this.emit("data", Buffer.from("CNT 08\r"));
        return;
      }

      if (text === "MES\r") {
        this.emit("data", Buffer.from("MES HELLO !!\r"));
        return;
      }

      if (text.startsWith("NAR ")) {
        const band = text.trim().split(" ")[1] ?? "0";
        this.emit("data", Buffer.from(`NAR ${band},${band === "1" ? "1" : "0"}\r`));
        return;
      }

      if (text === "MGL\r") {
        this.emit("data", Buffer.from("MGL  1 3 5 7\r"));
        return;
      }

      const scalarReplies: Record<string, string> = {
        BEP: "1",
        TXS: "0",
        ELK: "1",
        MRM: "1",
        VXB: "0",
        VXG: "4",
        VXD: "1",
        TSP: "1",
        TXH: "0",
        PT: "2",
        DLK: "0",
        CKEY: "0",
        TH: "1",
        NSFT: "0",
        ANT: "1",
        LAN: "0",
        DATP: "1",
      };
      const name = text.replace(/\r$/, "");
      const scalar = scalarReplies[name];

      if (scalar !== undefined) {
        this.emit("data", Buffer.from(`${name} ${scalar}\r`));
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
    const memoryBuffer = new Uint8Array(13_000).fill(0);
    const context = ProtocolContextFactory.build({
      memoryBuffer,
      memoryConfig: {
        addressEndianness: "big",
        addressSize: 2,
        chunkSize: 32,
        segments: {
          channels: { endAddress: 63, startAddress: 0 },
          settings: { endAddress: 12927, startAddress: 12800 },
        },
      },
      port: port as never,
      progressIndicator: { isCanceled: false, setValue: () => undefined },
      totalProgressUnits: 34,
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

    expect(port.writes[0]).toBe("MR 0,000\r");
    expect(port.writes).toContain("MNA 000\r");
    expect(port.writes).toContain("MR 0,001\r");
    expect(memoryBuffer[0]).not.toBe(255);
    expect(memoryBuffer[24]).toBe("C".charCodeAt(0));
    expect(memoryBuffer[32]).toBe(255);
    expect(memoryBuffer[12800]).toBe(1);
    expect(memoryBuffer[12802]).toBe(5);
    expect(memoryBuffer[12807]).toBe(1);
    expect(memoryBuffer[12809]).toBe(8);
    expect(Buffer.from(memoryBuffer.subarray(12810, 12818)).toString("ascii").replace(/\0/g, "")).toBe("HELLO !!");
    expect(memoryBuffer[12818]).toBe(1);
    expect(memoryBuffer[12823]).toBe(4);
    expect(memoryBuffer[12825]).toBe(0);
    expect(memoryBuffer[12826]).toBe(1);
    expect(memoryBuffer[12827]).toBe(0);
    expect([...memoryBuffer.subarray(12828, 12836)]).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(memoryBuffer[12841]).toBe(1);
    expect(memoryBuffer[12927]).toBe(0xa5);
  });
});
