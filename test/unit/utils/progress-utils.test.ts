import { describe, it } from "node:test";
import { expect } from "chai";
import type { RadioMemoryConfig, RadioProtocolStep } from "@springfield/ham-radio-api";
import {
  advanceProgress,
  countProtocolProgressUnits,
  countSegmentChunkUnits,
} from "../../../src/utils/progress-utils.js";
import { ProtocolContextFactory } from "./test-factories.js";

describe("progress-utils", () => {
  const memoryConfig: RadioMemoryConfig = {
    addressEndianness: "big",
    addressSize: 2,
    chunkSize: 64,
    segments: {
      channels: { endAddress: 127, startAddress: 0 },
      settings: { endAddress: 95, startAddress: 0 },
    },
  };

  it("counts chunk units from inclusive segment bounds", () => {
    expect(countSegmentChunkUnits(["channels"], memoryConfig)).to.equal(2);
    expect(countSegmentChunkUnits(["channels", "settings"], memoryConfig)).to.equal(4);
  });

  it("weights protocol progress by exchanges plus chunks", () => {
    const steps: RadioProtocolStep[] = [
      { expect: "0x06", send: ["0x50"] },
      { expect: { bytes: 8 }, send: ["0x02"] },
      {
        read: {
          expect: ["X", "$address", "$length", "$data"],
          segments: ["channels", "settings"],
          send: ["S", "$address", "$chunkSize"],
        },
      },
    ];

    expect(countProtocolProgressUnits(steps, memoryConfig)).to.equal(6);
  });

  it("advances progress against totalProgressUnits", () => {
    const values: number[] = [];
    const context = ProtocolContextFactory.build({
      completedProgressUnits: 0,
      progressIndicator: {
        isCanceled: false,
        setValue(value: number) {
          values.push(value);
        },
      },
      totalProgressUnits: 4,
    });

    advanceProgress(context);
    advanceProgress(context, 2);
    expect(values).to.deep.equal([0.25, 0.75]);
    expect(context.completedProgressUnits).to.equal(3);
  });
});
