import { beforeEach, describe, expect, it } from "vitest";
import { inclusiveSegmentSize, parseLiteralByte, resolveSendTokens } from "@src/utils/token-utils.js";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory } from "./test-factories.js";

describe("token-utils", () => {
  let context: ProtocolContext;

  beforeEach(() => {
    context = ProtocolContextFactory.build({
      variables: new Map([["segment.data", new Uint8Array([0xaa, 0xbb])]]),
    });
  });

  describe("inclusiveSegmentSize()", () => {
    it("counts both endpoints", () => {
      expect(inclusiveSegmentSize(0, 6143)).toBe(6144);
      expect(inclusiveSegmentSize(0, 0)).toBe(1);
    });
  });

  describe("parseLiteralByte()", () => {
    it("parses numbers, hex strings, and ASCII opcodes", () => {
      expect(parseLiteralByte(6)).toBe(6);
      expect(parseLiteralByte("0x06")).toBe(6);
      expect(parseLiteralByte("0xBB")).toBe(0xbb);
      expect(parseLiteralByte("S")).toBe(0x53);
      expect(parseLiteralByte("X")).toBe(0x58);
    });

    it("returns undefined for placeholders", () => {
      expect(parseLiteralByte("$address")).toBeUndefined();
      expect(parseLiteralByte("$data")).toBeUndefined();
    });
  });

  describe("resolveSendTokens()", () => {
    it("resolves literals and $address using addressSize and endianness", () => {
      const bytes = resolveSendTokens(["S", "$address", "$chunkSize"], context);
      expect(bytes).toEqual([0x53, 0x10, 0x00, 64]);
    });

    it("expands $data into payload bytes", () => {
      const bytes = resolveSendTokens(["X", "$address", "$chunkSize", "$data"], context);
      expect(bytes).toEqual([0x58, 0x10, 0x00, 64, 0xaa, 0xbb]);
    });

    it("uses $length from chunkLength when set", () => {
      context.variables.set("chunkLength", 8);
      expect(resolveSendTokens(["$length"], context)).toEqual([8]);
      expect(resolveSendTokens(["$chunkSize"], context)).toEqual([8]);
    });

    it("encodes $block as chunk index, not byte address", () => {
      context.currentSegment = {
        ...context.currentSegment!,
        currentAddress: 0x200,
      };
      context.memoryConfig = {
        ...context.memoryConfig,
        chunkSize: 256,
        addressSize: 2,
        addressEndianness: "big",
      };

      expect(resolveSendTokens(["R", "$block", "0x00", "0x00"], context)).toEqual([0x52, 0x00, 0x02, 0x00, 0x00]);
    });
  });
});
