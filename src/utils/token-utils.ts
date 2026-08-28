import type { RadioByteToken, RadioExpect, RadioExpectBytes } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";

const HEX_BYTE = /^0x[0-9a-fA-F]{1,2}$/i;

export const inclusiveSegmentSize = (startAddress: number, endAddress: number): number => endAddress - startAddress + 1;

export const isExpectBytes = (expect: RadioExpect): expect is RadioExpectBytes =>
  typeof expect === "object" && expect !== null && !Array.isArray(expect) && "bytes" in expect;

export const numberToBytes = (value: number, size: number, endianness: "big" | "little"): number[] => {
  const bytes: number[] = [];
  if (endianness === "big") {
    for (let i = size - 1; i >= 0; i--) {
      bytes.push((value >> (i * 8)) & 0xff);
    }
  } else {
    for (let i = 0; i < size; i++) {
      bytes.push((value >> (i * 8)) & 0xff);
    }
  }
  return bytes;
};

export const parseLiteralByte = (token: RadioByteToken): number | undefined => {
  if (typeof token === "number") {
    if (token < 0 || token > 255) {
      throw new Error(`Byte out of range: ${token}`);
    }
    return token;
  }

  if (HEX_BYTE.test(token)) {
    return Number.parseInt(token, 16);
  }

  if (token.length === 1 && !token.startsWith("$")) {
    return token.charCodeAt(0);
  }

  return undefined;
};

export const getChunkLength = (context: ProtocolContext): number => {
  const fromVar = context.variables.get("chunkLength");
  if (typeof fromVar === "number") {
    return fromVar;
  }
  return context.memoryConfig.chunkSize;
};

export const getCurrentAddress = (context: ProtocolContext): number => context.currentSegment?.currentAddress ?? 0;

export const getBlockNumber = (context: ProtocolContext): number => {
  const chunkSize = context.memoryConfig.chunkSize;
  return Math.floor(getCurrentAddress(context) / chunkSize);
};

const resolvePlaceholder = (token: string, context: ProtocolContext): number[] => {
  switch (token) {
    case "$address":
      return numberToBytes(getCurrentAddress(context), context.memoryConfig.addressSize, context.memoryConfig.addressEndianness);
    case "$block":
      return numberToBytes(getBlockNumber(context), context.memoryConfig.addressSize, context.memoryConfig.addressEndianness);
    case "$chunkSize":
      return [getChunkLength(context) & 0xff];
    case "$length":
      return [getChunkLength(context) & 0xff];
    default:
      throw new Error(`Unknown placeholder: ${token}`);
  }
};

/**
 * Resolve send tokens into wire bytes. `$data` expands to the current chunk payload.
 */
export const resolveSendTokens = (tokens: RadioByteToken[], context: ProtocolContext): number[] => {
  const result: number[] = [];

  for (const token of tokens) {
    if (token === "$data") {
      const data = context.variables.get("segment.data");
      if (data instanceof Uint8Array) {
        result.push(...data);
      }
      continue;
    }

    const literal = parseLiteralByte(token);
    if (literal !== undefined) {
      result.push(literal);
      continue;
    }

    if (typeof token === "string" && token.startsWith("$")) {
      result.push(...resolvePlaceholder(token, context));
      continue;
    }

    throw new Error(`Unable to resolve send token: ${String(token)}`);
  }

  return result;
};
