import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
import { EventEmitter } from "events";
import { extractDataFromResponse, executeExchange } from "@src/utils/step-utils.js";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory } from "./test-factories.js";

describe("step-utils", () => {
  let mockContext: ProtocolContext;

  beforeEach(() => {
    mockContext = ProtocolContextFactory.build();
  });

  describe("extractDataFromResponse()", () => {
    it("returns the full payload for an exact ACK", () => {
      const data = new Uint8Array([0x06]);
      expect(extractDataFromResponse(data, "0x06", mockContext)).to.deep.equal(data);
    });

    it("extracts $data from a framed response", () => {
      const payload = new Uint8Array(64).fill(0x11);
      const frame = new Uint8Array([0x58, 0x10, 0x00, 64, ...payload]);
      const extracted = extractDataFromResponse(frame, ["X", "$address", "$length", "$data"], mockContext);
      expect(extracted).to.deep.equal(payload);
    });
  });

  describe("executeExchange()", () => {
    it("sends resolved tokens and waits for expect", async () => {
      const parser = new EventEmitter();
      let written: Uint8Array | undefined;
      (mockContext.port as any).pipe = () => parser;
      (mockContext.port as any).write = (data: Uint8Array) => {
        written = data;
        setImmediate(() => parser.emit("data", Buffer.from([0x06])));
      };

      const result = await executeExchange({ send: ["0x02"], expect: "0x06", timeout: 1000 }, mockContext);
      expect(written).to.deep.equal(new Uint8Array([0x02]));
      expect(result).to.deep.equal(new Uint8Array([0x06]));
    });
  });
});
