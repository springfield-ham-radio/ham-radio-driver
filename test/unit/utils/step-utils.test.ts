import { beforeEach, describe, expect, it } from "vitest";
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
      expect(extractDataFromResponse(data, "0x06", mockContext)).toEqual(data);
    });

    it("extracts $data from a framed response", () => {
      const payload = new Uint8Array(64).fill(0x11);
      const frame = new Uint8Array([0x58, 0x10, 0x00, 64, ...payload]);
      const extracted = extractDataFromResponse(frame, ["X", "$address", "$length", "$data"], mockContext);
      expect(extracted).toEqual(payload);
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
      expect(written).toEqual(new Uint8Array([0x02]));
      expect(result).toEqual(new Uint8Array([0x06]));
    });
  });
});
