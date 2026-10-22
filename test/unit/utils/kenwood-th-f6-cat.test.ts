import { describe, expect, it } from "vitest";
import {
  NOAA_WEATHER_RADIO_FREQUENCIES_HZ,
  emptyKenwoodThF6Record,
  isKenwoodCatError,
  kenwoodMemoryReadCommand,
  kenwoodMemoryWriteCommand,
  kenwoodNameReadCommand,
  kenwoodNameWriteCommand,
  packKenwoodThF6Record,
  parseKenwoodMemoryReadLine,
  parseKenwoodNameLine,
  parseKenwoodSettingReadLine,
  applyKenwoodThF6SettingRead,
  kenwoodThF6SettingWriteCommands,
  kenwoodThF6SettingsLoaded,
  markKenwoodThF6SettingsLoaded,
  kenwoodThF6CtcssWireFromIndex,
  kenwoodThF6CtcssIndexFromWire,
  KENWOOD_TH_F6_SETTINGS_BASE,
  KENWOOD_TH_F6_SETTINGS_MAGIC_OFFSET,
  unpackKenwoodThF6Record,
} from "../../../src/utils/kenwood-th-f6-cat.js";

const hamBenchWeatherSpec = (freq: number) => ({
  freq,
  offset: 0,
  tuningStep: 0,
  duplex: 0,
  reverse: 0,
  toneMode: 0,
  ctcssMode: 0,
  dtcsMode: 0,
  rtone: 0,
  ctone: 0,
  dtcsCode: 0,
  mode: 0,
  skip: 0,
  split: false,
});

describe("kenwood-th-f6-cat", () => {
  it("parses an MR reply with command echo into a simplex memory", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,1,0,0,09,09,000,000000000,0,0");

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
    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,1,0,0,09,09,000,000000000,0,0");
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

  it("writes MNA names without space padding", () => {
    expect(Buffer.from(kenwoodNameWriteCommand(0, "")).toString("ascii")).toBe("MNA 000,\r");
    expect(Buffer.from(kenwoodNameWriteCommand(0, "WX")).toString("ascii")).toBe("MNA 000,WX\r");
    expect(Buffer.from(kenwoodNameWriteCommand(0, "CALL")).toString("ascii")).toBe("MNA 000,CALL\r");
    expect(Buffer.from(kenwoodNameWriteCommand(0, "12345678")).toString("ascii")).toBe("MNA 000,12345678\r");
    expect(Buffer.from(kenwoodNameWriteCommand(0, "123456789")).toString("ascii")).toBe("MNA 000,12345678\r");
  });

  it("rstrips space-padded MNA replies on read", () => {
    expect(parseKenwoodNameLine("MNA 000,        ")).toBe("");
  });

  it("zero-pads rtone and ctone on MW for all channels including NOAA weather", () => {
    const simplex = hamBenchWeatherSpec(146_520_000);
    const simplexLine = Buffer.from(kenwoodMemoryWriteCommand(0, simplex)).toString("ascii").trim();

    expect(simplexLine).toBe("MW 0,000,00146520000,0,0,0,0,0,0,01,01,000,000000000,0,0");

    for (const freq of NOAA_WEATHER_RADIO_FREQUENCIES_HZ) {
      const record = packKenwoodThF6Record(hamBenchWeatherSpec(freq), "WX");
      const { spec } = unpackKenwoodThF6Record(record);
      const line = Buffer.from(kenwoodMemoryWriteCommand(6, spec)).toString("ascii").trim();

      expect(line).toBe(`MW 0,006,${freq.toString().padStart(11, "0")},0,0,0,0,0,0,01,01,000,000000000,0,0`);
    }
  });

  it("maps 1-based CAT CTCSS codes to 0-based record indexes (88.5 Hz is wire 09)", () => {
    expect(kenwoodThF6CtcssIndexFromWire(9)).toBe(8);
    expect(kenwoodThF6CtcssWireFromIndex(8)).toBe(9);

    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,1,0,0,09,09,000,000000000,0,0");
    expect(spec?.rtone).toBe(8);
    expect(spec?.ctone).toBe(8);

    const line = Buffer.from(kenwoodMemoryWriteCommand(0, spec!)).toString("ascii").trim();
    expect(line).toContain(",09,09,");
  });

  it("keeps DCS wire codes as the record byte (index mapping unverified)", () => {
    const spec = parseKenwoodMemoryReadLine("MR 0,000,00146520000,0,0,0,0,0,0,01,01,023,000000000,0,0");
    expect(spec?.dtcsCode).toBe(23);
  });

  describe("settings CAT commands", () => {
    const settingsBuffer = (): Uint8Array => new Uint8Array(13_000);

    it("parses get replies into logical settings bytes", () => {
      expect(parseKenwoodSettingReadLine("APO", "APO 1")).toBe(1);
      expect(parseKenwoodSettingReadLine("CNT", "CNT 08")).toBe(8);
      expect(parseKenwoodSettingReadLine("MES", "MES HELLO !!")).toBe("HELLO !!");
      expect(parseKenwoodSettingReadLine("APO", "N")).toBe(undefined);
    });

    it("marks settings loaded only after all commands succeed", () => {
      const buffer = settingsBuffer();
      expect(applyKenwoodThF6SettingRead(buffer, "APO", "APO 2")).toBe(true);
      expect(buffer[KENWOOD_TH_F6_SETTINGS_BASE]).toBe(2);
      expect(kenwoodThF6SettingsLoaded(buffer)).toBe(false);
      markKenwoodThF6SettingsLoaded(buffer, true);
      expect(kenwoodThF6SettingsLoaded(buffer)).toBe(true);
    });

    it("builds set commands from a loaded settings image", () => {
      const buffer = settingsBuffer();
      applyKenwoodThF6SettingRead(buffer, "CNT", "CNT 08");
      applyKenwoodThF6SettingRead(buffer, "MES", "MES HELLO !!");
      markKenwoodThF6SettingsLoaded(buffer, true);

      const lines = kenwoodThF6SettingWriteCommands(buffer).map((command) => Buffer.from(command).toString("ascii").trim());
      expect(lines).toContain("CNT 08");
      expect(lines).toContain("MES HELLO !!");
      expect(kenwoodThF6SettingWriteCommands(new Uint8Array(13_000))).toEqual([]);
    });
  });
});
