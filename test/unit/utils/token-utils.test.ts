import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
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
      expect(inclusiveSegmentSize(0, 6143)).to.equal(6144);
      expect(inclusiveSegmentSize(0, 0)).to.equal(1);
    });
  });

  describe("parseLiteralByte()", () => {
    it("parses numbers, hex strings, and ASCII opcodes", () => {
      expect(parseLiteralByte(6)).to.equal(6);
      expect(parseLiteralByte("0x06")).to.equal(6);
      expect(parseLiteralByte("0xBB")).to.equal(0xbb);
      expect(parseLiteralByte("S")).to.equal(0x53);
      expect(parseLiteralByte("X")).to.equal(0x58);
    });

    it("returns undefined for placeholders", () => {
      expect(parseLiteralByte("$address")).to.be.undefined;
      expect(parseLiteralByte("$data")).to.be.undefined;
    });
  });

  describe("resolveSendTokens()", () => {
    it("resolves literals and $address using addressSize and endianness", () => {
      const bytes = resolveSendTokens(["S", "$address", "$chunkSize"], context);
      expect(bytes).to.deep.equal([0x53, 0x10, 0x00, 64]);
    });

    it("expands $data into payload bytes", () => {
      const bytes = resolveSendTokens(["X", "$address", "$chunkSize", "$data"], context);
      expect(bytes).to.deep.equal([0x58, 0x10, 0x00, 64, 0xaa, 0xbb]);
    });

    it("uses $length from chunkLength when set", () => {
      context.variables.set("chunkLength", 8);
      expect(resolveSendTokens(["$length"], context)).to.deep.equal([8]);
      expect(resolveSendTokens(["$chunkSize"], context)).to.deep.equal([8]);
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

      expect(resolveSendTokens(["R", "$block", "0x00", "0x00"], context)).to.deep.equal([0x52, 0x00, 0x02, 0x00, 0x00]);
    });
  });
});
