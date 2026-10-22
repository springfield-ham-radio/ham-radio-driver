/**
 * Kenwood TH-F6 live CAT: parse MR/MNA lines and pack the logical 32-byte channel record.
 *
 * The radio does not clone EEPROM. Springfield stores a logical image so the memory-map
 * codec can edit channels: freq and offset as little-endian u32, then u8 fields, then an 8-byte name.
 */

export interface KenwoodThF6MemorySpec {
  freq: number;
  offset: number;
  tuningStep: number;
  duplex: number;
  reverse: number;
  toneMode: number;
  ctcssMode: number;
  dtcsMode: number;
  rtone: number;
  ctone: number;
  dtcsCode: number;
  mode: number;
  skip: number;
  split: boolean;
}

export const KENWOOD_TH_F6_RECORD_SIZE = 32;
export const KENWOOD_TH_F6_INDEX_WIDTH = 3;
export const KENWOOD_TH_F6_EMPTY_BYTE = 255;
export const KENWOOD_CAT_CR = 0x0d;

/** Logical settings block base address in the TH-F6 memory image. */
export const KENWOOD_TH_F6_SETTINGS_BASE = 12800;
/** Last byte of the settings segment; holds a loaded marker after a full CAT settings read. */
export const KENWOOD_TH_F6_SETTINGS_MAGIC_OFFSET = 12927;
export const KENWOOD_TH_F6_SETTINGS_LOADED_MAGIC = 0xa5;

const SETTINGS_FIELD_OFFSETS = {
  apo: 0,
  bat: 1,
  sv: 2,
  bal: 3,
  mnf: 4,
  scr: 5,
  att: 6,
  aro: 7,
  vox: 8,
  cnt: 9,
  mes: 10,
} as const;

const SETTINGS_COMMANDS = ["APO", "BAT", "SV", "BAL", "MNF", "SCR", "ATT", "ARO", "VOX", "CNT", "MES"] as const;

export const KENWOOD_TH_F6_SETTINGS_COMMAND_COUNT = SETTINGS_COMMANDS.length;

/** NOAA Weather Radio channel frequencies (Hz), WX1–WX7. */
export const NOAA_WEATHER_RADIO_FREQUENCIES_HZ = [
  162_550_000,
  162_400_000,
  162_475_000,
  162_425_000,
  162_450_000,
  162_500_000,
  162_525_000,
] as const;

const NAME_OFFSET = 24;
const NAME_LENGTH = 8;

const asciiCommand = (text: string): number[] => [...Buffer.from(`${text}\r`, "ascii")];

const padIndex = (index: number, width = KENWOOD_TH_F6_INDEX_WIDTH): string => index.toString().padStart(width, "0");

const parseUnsigned = (value: string, radix: number): number => {
  const parsed = Number.parseInt(value.trim(), radix);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampByte = (value: number): number => Math.max(0, Math.min(255, value | 0));

/**
 * TH-F6 CAT uses 1-based CTCSS tone codes on the wire; the logical record stores 0-based ctcss-index bytes.
 */
export const kenwoodThF6CtcssWireFromIndex = (index: number): number => clampByte((index | 0) + 1);

export const kenwoodThF6CtcssIndexFromWire = (wire: number): number => Math.max(0, clampByte(wire) - 1);

const writeU32Le = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value >>> 0, true);
};

const readU32Le = (view: DataView, offset: number): number => view.getUint32(offset, true);

/**
 * True when a CAT line is an empty-memory or error reply (`N`, `?`).
 */
export const isKenwoodCatError = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed === "N" || trimmed === "?" || trimmed === "N?" || /^[N?]$/.test(trimmed);
};

/**
 * Decode a CAT line (CR already stripped) as ASCII.
 */
export const kenwoodCatLineFromBytes = (data: Uint8Array): string =>
  Buffer.from(data)
    .toString("ascii")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();

export const kenwoodMemoryReadCommand = (index: number): number[] => asciiCommand(`MR 0,${padIndex(index)}`);

export const kenwoodNameReadCommand = (index: number): number[] => asciiCommand(`MNA ${padIndex(index)}`);

export const kenwoodSplitReadCommand = (index: number): number[] => asciiCommand(`MR 1,${padIndex(index)}`);

export const kenwoodMemoryWriteCommand = (index: number, spec?: KenwoodThF6MemorySpec): number[] => {
  if (spec === undefined) {
    return asciiCommand(`MW 0,${padIndex(index)}`);
  }

  const fields = [
    spec.freq.toString().padStart(11, "0"),
    spec.tuningStep.toString(16).toUpperCase(),
    spec.duplex.toString(),
    spec.reverse.toString(),
    spec.toneMode.toString(),
    spec.ctcssMode.toString(),
    spec.dtcsMode.toString(),
    // TH-F6 live CAT rejects single-digit rtone/ctone fields (N); CHIRP uses %02i.
    kenwoodThF6CtcssWireFromIndex(spec.rtone).toString().padStart(2, "0"),
    kenwoodThF6CtcssWireFromIndex(spec.ctone).toString().padStart(2, "0"),
    spec.dtcsCode.toString().padStart(3, "0"),
    spec.offset.toString().padStart(9, "0"),
    spec.mode.toString(),
    spec.skip.toString(),
  ];

  return asciiCommand(`MW 0,${padIndex(index)},${fields.join(",")}`);
};

export const kenwoodNameWriteCommand = (index: number, name: string): number[] => {
  const trimmed = name.replace(/\0/g, " ").trimEnd().slice(0, NAME_LENGTH);
  return asciiCommand(`MNA ${padIndex(index)},${trimmed}`);
};

export const kenwoodSplitWriteCommand = (index: number, transmitFrequency: number): number[] =>
  asciiCommand(`MW 1,${padIndex(index)},${transmitFrequency.toString().padStart(11, "0")},0`);

const findFrequencyFieldIndex = (fields: string[]): number => fields.findIndex((field) => /^\d{9,11}$/.test(field.trim()));

/**
 * Parse an `MR 0,nnn,...` reply into a memory spec. Returns undefined for empty/error.
 */
export const parseKenwoodMemoryReadLine = (line: string): KenwoodThF6MemorySpec | undefined => {
  if (isKenwoodCatError(line)) {
    return undefined;
  }

  const fields = line.split(",").map((field) => field.trim());
  const freqIndex = findFrequencyFieldIndex(fields);

  if (freqIndex < 0 || freqIndex + 12 >= fields.length) {
    return undefined;
  }

  const duplex = clampByte(parseUnsigned(fields[freqIndex + 2] ?? "0", 10));

  return {
    freq: parseUnsigned(fields[freqIndex] ?? "0", 10),
    tuningStep: clampByte(parseUnsigned(fields[freqIndex + 1] ?? "0", 16)),
    duplex,
    reverse: clampByte(parseUnsigned(fields[freqIndex + 3] ?? "0", 10)),
    toneMode: clampByte(parseUnsigned(fields[freqIndex + 4] ?? "0", 10)),
    ctcssMode: clampByte(parseUnsigned(fields[freqIndex + 5] ?? "0", 10)),
    dtcsMode: clampByte(parseUnsigned(fields[freqIndex + 6] ?? "0", 10)),
    rtone: kenwoodThF6CtcssIndexFromWire(parseUnsigned(fields[freqIndex + 7] ?? "0", 10)),
    ctone: kenwoodThF6CtcssIndexFromWire(parseUnsigned(fields[freqIndex + 8] ?? "0", 10)),
    dtcsCode: clampByte(parseUnsigned(fields[freqIndex + 9] ?? "0", 10)),
    offset: parseUnsigned(fields[freqIndex + 10] ?? "0", 10),
    mode: clampByte(parseUnsigned(fields[freqIndex + 11] ?? "0", 10)),
    skip: clampByte(parseUnsigned(fields[freqIndex + 12] ?? "0", 10)),
    split: duplex === 3,
  };
};

/**
 * Parse `MNA nnn,name`. Empty/error replies become an empty name.
 */
export const parseKenwoodNameLine = (line: string): string => {
  if (isKenwoodCatError(line)) {
    return "";
  }

  const comma = line.indexOf(",");

  if (comma < 0) {
    return "";
  }

  return line
    .slice(comma + 1)
    .replace(/\0/g, " ")
    .trimEnd()
    .slice(0, NAME_LENGTH);
};

/**
 * Parse `MR 1,nnn,...` and return the split TX frequency.
 */
export const parseKenwoodSplitTxLine = (line: string): number | undefined => {
  const spec = parseKenwoodMemoryReadLine(line);
  return spec?.freq;
};

export const emptyKenwoodThF6Record = (emptyByte = KENWOOD_TH_F6_EMPTY_BYTE): Uint8Array =>
  new Uint8Array(KENWOOD_TH_F6_RECORD_SIZE).fill(emptyByte);

/**
 * Pack a parsed CAT memory and name into the logical 32-byte TH-F6 channel image.
 */
export const packKenwoodThF6Record = (spec: KenwoodThF6MemorySpec, name: string): Uint8Array => {
  const record = new Uint8Array(KENWOOD_TH_F6_RECORD_SIZE);
  const view = new DataView(record.buffer);

  writeU32Le(view, 0, spec.freq);
  writeU32Le(view, 4, spec.offset);
  record[8] = clampByte(spec.tuningStep);
  record[9] = clampByte(spec.duplex);
  record[10] = clampByte(spec.toneMode);
  record[11] = clampByte(spec.ctcssMode);
  record[12] = clampByte(spec.dtcsMode);
  record[13] = clampByte(spec.rtone);
  record[14] = clampByte(spec.ctone);
  record[15] = clampByte(spec.dtcsCode);
  record[16] = clampByte(spec.mode);
  record[17] = clampByte(spec.skip);
  record[18] = spec.split || spec.duplex === 3 ? 1 : 0;

  const nameBytes = Buffer.from(name.slice(0, NAME_LENGTH), "ascii");
  record.set(nameBytes, NAME_OFFSET);

  return record;
};

export const isKenwoodThF6RecordEmpty = (record: Uint8Array, emptyByte = KENWOOD_TH_F6_EMPTY_BYTE): boolean =>
  record.length === 0 || record[0] === emptyByte;

/**
 * Unpack a logical 32-byte record for CAT write.
 */
export const unpackKenwoodThF6Record = (record: Uint8Array): { spec: KenwoodThF6MemorySpec; name: string } => {
  const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
  const duplex = record[9] ?? 0;
  const split = (record[18] ?? 0) === 1 || duplex === 3;

  return {
    spec: {
      freq: readU32Le(view, 0),
      offset: readU32Le(view, 4),
      tuningStep: record[8] ?? 0,
      duplex,
      reverse: 0,
      toneMode: record[10] ?? 0,
      ctcssMode: record[11] ?? 0,
      dtcsMode: record[12] ?? 0,
      rtone: record[13] ?? 0,
      ctone: record[14] ?? 0,
      dtcsCode: record[15] ?? 0,
      mode: record[16] ?? 0,
      skip: record[17] ?? 0,
      split,
    },
    name: Buffer.from(record.subarray(NAME_OFFSET, NAME_OFFSET + NAME_LENGTH))
      .toString("ascii")
      .replace(/\0/g, " ")
      .trimEnd(),
  };
};

export const kenwoodSettingReadCommand = (command: string): number[] => asciiCommand(command);

const parseSettingScalarLine = (command: string, line: string): number | undefined => {
  if (isKenwoodCatError(line)) {
    return undefined;
  }

  const trimmed = line.trim();
  const prefix = `${command} `;

  if (!trimmed.toUpperCase().startsWith(prefix)) {
    return undefined;
  }

  const valueText = trimmed.slice(prefix.length).trim();

  if (valueText.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(valueText, 10);
  return Number.isFinite(parsed) ? clampByte(parsed) : undefined;
};

const parseSettingMesLine = (line: string): string | undefined => {
  if (isKenwoodCatError(line)) {
    return undefined;
  }

  const trimmed = line.trim();
  const prefix = "MES ";

  if (!trimmed.toUpperCase().startsWith(prefix)) {
    return undefined;
  }

  return trimmed
    .slice(prefix.length)
    .replace(/\0/g, "")
    .trimEnd()
    .slice(0, NAME_LENGTH);
};

export const parseKenwoodSettingReadLine = (command: string, line: string): number | string | undefined => {
  if (command === "MES") {
    return parseSettingMesLine(line);
  }

  return parseSettingScalarLine(command, line);
};

export const kenwoodThF6SettingsLoaded = (buffer: Uint8Array): boolean =>
  buffer.length > KENWOOD_TH_F6_SETTINGS_MAGIC_OFFSET &&
  buffer[KENWOOD_TH_F6_SETTINGS_MAGIC_OFFSET] === KENWOOD_TH_F6_SETTINGS_LOADED_MAGIC;

const settingsAddress = (fieldOffset: number): number => KENWOOD_TH_F6_SETTINGS_BASE + fieldOffset;

export const applyKenwoodThF6SettingRead = (buffer: Uint8Array, command: string, line: string): boolean => {
  if (command === "MES") {
    const message = parseSettingMesLine(line);

    if (message === undefined) {
      return false;
    }

    const offset = settingsAddress(SETTINGS_FIELD_OFFSETS.mes);
    buffer.fill(0, offset, offset + NAME_LENGTH);
    buffer.set(Buffer.from(message, "ascii"), offset);
    return true;
  }

  const value = parseSettingScalarLine(command, line);

  if (value === undefined) {
    return false;
  }

  const fieldKey = command.toLowerCase() as keyof typeof SETTINGS_FIELD_OFFSETS;

  if (fieldKey === "mes") {
    return false;
  }

  const fieldOffset = SETTINGS_FIELD_OFFSETS[fieldKey];

  if (fieldOffset === undefined) {
    return false;
  }

  buffer[settingsAddress(fieldOffset)] = value;
  return true;
};

export const markKenwoodThF6SettingsLoaded = (buffer: Uint8Array, loaded: boolean): void => {
  if (buffer.length <= KENWOOD_TH_F6_SETTINGS_MAGIC_OFFSET) {
    return;
  }

  buffer[KENWOOD_TH_F6_SETTINGS_MAGIC_OFFSET] = loaded ? KENWOOD_TH_F6_SETTINGS_LOADED_MAGIC : 0;
};

export const kenwoodThF6SettingWriteCommands = (buffer: Uint8Array): number[][] => {
  if (!kenwoodThF6SettingsLoaded(buffer)) {
    return [];
  }

  const commands: number[][] = [];

  for (const command of SETTINGS_COMMANDS) {
    if (command === "MES") {
      const offset = settingsAddress(SETTINGS_FIELD_OFFSETS.mes);
      const message = Buffer.from(buffer.subarray(offset, offset + NAME_LENGTH))
        .toString("ascii")
        .replace(/\0/g, "")
        .trimEnd()
        .slice(0, NAME_LENGTH);
      commands.push(asciiCommand(`MES ${message}`));
      continue;
    }

    if (command === "CNT") {
      const contrast = buffer[settingsAddress(SETTINGS_FIELD_OFFSETS.cnt)] ?? 0;
      commands.push(asciiCommand(`CNT ${contrast.toString().padStart(2, "0")}`));
      continue;
    }

    const fieldKey = command.toLowerCase() as keyof typeof SETTINGS_FIELD_OFFSETS;
    const fieldOffset = SETTINGS_FIELD_OFFSETS[fieldKey];
    const value = buffer[settingsAddress(fieldOffset)] ?? 0;
    commands.push(asciiCommand(`${command} ${value}`));
  }

  return commands;
};

export const kenwoodThF6SettingCommands = (): readonly string[] => SETTINGS_COMMANDS;
