import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
import { extractExpectData, getExpectedLength, matchExpect } from "@src/utils/expect-matcher.js";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory } from "./test-factories.js";

describe("expect-matcher", () => {
  let context: ProtocolContext;

  beforeEach(() => {
    context = ProtocolContextFactory.build();
  });

  it("matches an exact ACK byte", () => {
    expect(matchExpect(Buffer.from([0x06]), "0x06", context)).to.be.true;
    expect(matchExpect(Buffer.from([0x06]), 6, context)).to.be.true;
    expect(matchExpect(Buffer.from([0x07]), "0x06", context)).to.be.false;
    expect(getExpectedLength("0x06", context)).to.equal(1);
  });

  it("matches opaque byte counts", () => {
    expect(matchExpect(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), { bytes: 8 }, context)).to.be.true;
    expect(matchExpect(Buffer.from([1, 2, 3]), { bytes: 8 }, context)).to.be.false;
    expect(getExpectedLength({ bytes: 8 }, context)).to.equal(8);
  });

  it("matches a framed read response and extracts $data", () => {
    const expectPattern = ["X", "$address", "$length", "$data"];
    const payload = Buffer.alloc(64, 0xab);
    const frame = Buffer.concat([Buffer.from([0x58, 0x10, 0x00, 64]), payload]);

    expect(getExpectedLength(expectPattern, context)).to.equal(4 + 64);
    expect(matchExpect(frame, expectPattern, context)).to.be.true;
    expect(extractExpectData(new Uint8Array(frame), expectPattern, context)).to.deep.equal(new Uint8Array(payload));
  });

  it("matches a Kenwood clone framed read with $block", () => {
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
    context.variables.set("chunkLength", 256);

    const expectPattern = ["W", "$block", "0x00", "0x00", "$data"];
    const payload = Buffer.alloc(256, 0xab);
    const frame = Buffer.concat([Buffer.from([0x57, 0x00, 0x02, 0x00, 0x00]), payload]);

    expect(getExpectedLength(expectPattern, context)).to.equal(5 + 256);
    expect(matchExpect(frame, expectPattern, context)).to.be.true;
    expect(extractExpectData(new Uint8Array(frame), expectPattern, context)).to.deep.equal(new Uint8Array(payload));
  });
});
