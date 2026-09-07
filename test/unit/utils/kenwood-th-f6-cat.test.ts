import { describe, it } from "node:test";
import { expect } from "chai";
import {
  emptyKenwoodThF6Record,
  isKenwoodCatError,
  kenwoodMemoryReadCommand,
  kenwoodMemoryWriteCommand,
  kenwoodNameReadCommand,
  packKenwoodThF6Record,
  parseKenwoodMemoryReadLine,
  parseKenwoodNameLine,
  unpackKenwoodThF6Record,
} from "../../../src/utils/kenwood-th-f6-cat.js";

describe("kenwood-th-f6-cat", () => {
  it("parses an MR reply with command echo into a simplex memory", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,1,0,0,8,8,000,000000000,0,0");

    expect(spec).to.not.equal(undefined);
    expect(spec?.freq).to.equal(146_520_000);
    expect(spec?.tuningStep).to.equal(0);
    expect(spec?.duplex).to.equal(0);
    expect(spec?.toneMode).to.equal(1);
    expect(spec?.rtone).to.equal(8);
    expect(spec?.offset).to.equal(0);
    expect(spec?.split).to.equal(false);
  });

  it("treats N and ? as empty memories", () => {
    expect(isKenwoodCatError("N")).to.equal(true);
    expect(isKenwoodCatError("?")).to.equal(true);
    expect(parseKenwoodMemoryReadLine("N")).to.equal(undefined);
  });

  it("parses hex tuning-step indexes", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,001,00146940000,A,2,0,0,0,0,0,0,000,000060000,0,0");

    expect(spec?.tuningStep).to.equal(10);
    expect(spec?.duplex).to.equal(2);
    expect(spec?.offset).to.equal(60_000);
  });

  it("parses MNA names and packs them into the logical record", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,1,0,0,8,8,000,000000000,0,0");
    const name = parseKenwoodNameLine("MNA 000,CALL");
    const record = packKenwoodThF6Record(spec!, name);

    expect(name).to.equal("CALL");
    expect(record[0]).to.not.equal(255);
    expect(Buffer.from(record.subarray(24, 32)).toString("ascii").replace(/\0/g, "").trim()).to.equal("CALL");

    const unpacked = unpackKenwoodThF6Record(record);
    expect(unpacked.spec.freq).to.equal(146_520_000);
    expect(unpacked.name).to.equal("CALL");
  });

  it("builds MR and empty MW commands with a three-digit index", () => {
    expect(Buffer.from(kenwoodMemoryReadCommand(7)).toString("ascii")).to.equal("MR 0,007\r");
    expect(Buffer.from(kenwoodNameReadCommand(7)).toString("ascii")).to.equal("MNA 007\r");
    expect(Buffer.from(kenwoodMemoryWriteCommand(7)).toString("ascii")).to.equal("MW 0,007\r");
  });

  it("fills empty records with 0xFF", () => {
    const empty = emptyKenwoodThF6Record();
    expect(empty).to.have.length(32);
    expect([...empty].every((byte) => byte === 255)).to.equal(true);
  });
});
