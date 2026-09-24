import { describe, expect, it } from "vitest";
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

    expect(spec).not.toBe(undefined);
    expect(spec?.freq).toBe(146_520_000);
    expect(spec?.tuningStep).toBe(0);
    expect(spec?.duplex).toBe(0);
    expect(spec?.toneMode).toBe(1);
    expect(spec?.rtone).toBe(8);
    expect(spec?.offset).toBe(0);
    expect(spec?.split).toBe(false);
  });

  it("treats N and ? as empty memories", () => {
    expect(isKenwoodCatError("N")).toBe(true);
    expect(isKenwoodCatError("?")).toBe(true);
    expect(parseKenwoodMemoryReadLine("N")).toBe(undefined);
  });

  it("parses hex tuning-step indexes", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,001,00146940000,A,2,0,0,0,0,0,0,000,000060000,0,0");

    expect(spec?.tuningStep).toBe(10);
    expect(spec?.duplex).toBe(2);
    expect(spec?.offset).toBe(60_000);
  });

  it("parses MNA names and packs them into the logical record", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,1,0,0,8,8,000,000000000,0,0");
    const name = parseKenwoodNameLine("MNA 000,CALL");
    const record = packKenwoodThF6Record(spec!, name);

    expect(name).toBe("CALL");
    expect(record[0]).not.toBe(255);
    expect(Buffer.from(record.subarray(24, 32)).toString("ascii").replace(/\0/g, "").trim()).toBe("CALL");

    const unpacked = unpackKenwoodThF6Record(record);
    expect(unpacked.spec.freq).toBe(146_520_000);
    expect(unpacked.name).toBe("CALL");
  });

  it("builds MR and empty MW commands with a three-digit index", () => {
    expect(Buffer.from(kenwoodMemoryReadCommand(7)).toString("ascii")).toBe("MR 0,007\r");
    expect(Buffer.from(kenwoodNameReadCommand(7)).toString("ascii")).toBe("MNA 007\r");
    expect(Buffer.from(kenwoodMemoryWriteCommand(7)).toString("ascii")).toBe("MW 0,007\r");
  });

  it("fills empty records with 0xFF", () => {
    const empty = emptyKenwoodThF6Record();
    expect(empty).toHaveLength(32);
    expect([...empty].every((byte) => byte === 255)).toBe(true);
  });
});
