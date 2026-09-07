import type { RadioCatMemoryConfig, RadioCatPack } from "@springfield/ham-radio-api";
import {
  emptyKenwoodThF6Record,
  isKenwoodThF6RecordEmpty,
  kenwoodMemoryReadCommand,
  kenwoodMemoryWriteCommand,
  kenwoodNameReadCommand,
  kenwoodNameWriteCommand,
  kenwoodSplitReadCommand,
  kenwoodSplitWriteCommand,
  kenwoodCatLineFromBytes,
  packKenwoodThF6Record,
  parseKenwoodMemoryReadLine,
  parseKenwoodNameLine,
  parseKenwoodSplitTxLine,
  unpackKenwoodThF6Record,
} from "./kenwood-th-f6-cat.js";

export interface CatPacker {
  isOccupied(memoryLine: string): boolean;
  memoryReadCommand(index: number): number[];
  nameReadCommand(index: number): number[];
  splitReadCommand(index: number): number[];
  memoryWriteCommand(index: number, record: Uint8Array, emptyByte: number): number[];
  nameWriteCommand(index: number, record: Uint8Array): number[] | undefined;
  splitWriteCommand(index: number, record: Uint8Array): number[] | undefined;
  packRead(memoryLine: string, nameLine: string, splitLine: string | undefined, emptyByte: number): Uint8Array;
}

const kenwoodThF6Packer: CatPacker = {
  isOccupied(memoryLine) {
    return parseKenwoodMemoryReadLine(memoryLine) !== undefined;
  },
  memoryReadCommand: kenwoodMemoryReadCommand,
  nameReadCommand: kenwoodNameReadCommand,
  splitReadCommand: kenwoodSplitReadCommand,
  memoryWriteCommand(index, record, emptyByte) {
    if (isKenwoodThF6RecordEmpty(record, emptyByte)) {
      return kenwoodMemoryWriteCommand(index);
    }

    return kenwoodMemoryWriteCommand(index, unpackKenwoodThF6Record(record).spec);
  },
  nameWriteCommand(index, record) {
    if (isKenwoodThF6RecordEmpty(record)) {
      return undefined;
    }

    return kenwoodNameWriteCommand(index, unpackKenwoodThF6Record(record).name);
  },
  splitWriteCommand(index, record) {
    if (isKenwoodThF6RecordEmpty(record)) {
      return undefined;
    }

    const { spec } = unpackKenwoodThF6Record(record);

    if (!spec.split) {
      return undefined;
    }

    return kenwoodSplitWriteCommand(index, spec.offset);
  },
  packRead(memoryLine, nameLine, splitLine, emptyByte) {
    const spec = parseKenwoodMemoryReadLine(memoryLine);

    if (spec === undefined) {
      return emptyKenwoodThF6Record(emptyByte);
    }

    if (spec.split) {
      const transmitFrequency = splitLine === undefined ? undefined : parseKenwoodSplitTxLine(splitLine);

      if (transmitFrequency !== undefined) {
        spec.offset = transmitFrequency;
      }
    }

    return packKenwoodThF6Record(spec, parseKenwoodNameLine(nameLine));
  },
};

const packers: Record<RadioCatPack, CatPacker> = {
  "kenwood-th-f6": kenwoodThF6Packer,
};

export const getCatPacker = (pack: RadioCatPack): CatPacker => {
  const packer = packers[pack];

  if (packer === undefined) {
    throw new Error(`Unknown CAT packer: ${pack}`);
  }

  return packer;
};

export const catTimeoutMs = (config: RadioCatMemoryConfig): number => config.timeout ?? 2000;

export const catEmptyByte = (config: RadioCatMemoryConfig): number => config.emptyByte ?? 255;

export const catLineFromResponse = (data: Uint8Array): string => kenwoodCatLineFromBytes(data);

export const delayMs = async (milliseconds: number): Promise<void> => {
  if (milliseconds <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};
