import type { RadioByteToken, RadioExpect } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import { getChunkLength, getCurrentAddress, isExpectBytes, numberToBytes, parseLiteralByte } from "./token-utils.js";

const expectTokens = (expect: RadioByteToken | RadioByteToken[]): RadioByteToken[] => (Array.isArray(expect) ? expect : [expect]);

export const getExpectedLength = (expect: RadioExpect, context: ProtocolContext): number => {
  if (isExpectBytes(expect)) {
    return expect.bytes;
  }

  let length = 0;
  for (const token of expectTokens(expect)) {
    if (token === "$data") {
      length += getChunkLength(context);
    } else if (token === "$address" || token === "$block") {
      length += context.memoryConfig.addressSize;
    } else if (token === "$length" || token === "$chunkSize") {
      length += 1;
    } else {
      length += 1;
    }
  }
  return length;
};

const bytesEqual = (actual: Uint8Array | Buffer, offset: number, expected: number[]): boolean => {
  if (offset + expected.length > actual.length) {
    return false;
  }
  return expected.every((value, index) => actual[offset + index] === value);
};

export const matchExpect = (data: Buffer, expect: RadioExpect, context: ProtocolContext): boolean => {
  if (isExpectBytes(expect)) {
    return data.length === expect.bytes;
  }

  let offset = 0;
  let dataLength = getChunkLength(context);

  for (const token of expectTokens(expect)) {
    if (token === "$data") {
      return offset + dataLength <= data.length;
    }

    if (token === "$address" || token === "$block") {
      const value = token === "$block" ? Math.floor(getCurrentAddress(context) / context.memoryConfig.chunkSize) : getCurrentAddress(context);
      const addressBytes = numberToBytes(value, context.memoryConfig.addressSize, context.memoryConfig.addressEndianness);
      if (!bytesEqual(data, offset, addressBytes)) {
        return false;
      }
      offset += addressBytes.length;
      continue;
    }

    if (token === "$length") {
      if (offset >= data.length) {
        return false;
      }
      dataLength = data[offset] ?? 0;
      offset += 1;
      continue;
    }

    if (token === "$chunkSize") {
      if (data[offset] !== (getChunkLength(context) & 0xff)) {
        return false;
      }
      offset += 1;
      continue;
    }

    const literal = parseLiteralByte(token);
    if (literal === undefined) {
      throw new Error(`Unable to match expect token: ${String(token)}`);
    }
    if (data[offset] !== literal) {
      return false;
    }
    offset += 1;
  }

  return data.length >= offset;
};

export const extractExpectData = (data: Uint8Array, expect: RadioExpect, context: ProtocolContext): Uint8Array => {
  if (isExpectBytes(expect)) {
    return data;
  }

  const tokens = expectTokens(expect);
  const dataIndex = tokens.indexOf("$data");
  if (dataIndex === -1) {
    return data;
  }

  let offset = 0;
  let dataLength = getChunkLength(context);

  for (let i = 0; i < dataIndex; i++) {
    const token = tokens[i];
    if (token === "$address" || token === "$block") {
      offset += context.memoryConfig.addressSize;
    } else if (token === "$length") {
      dataLength = data[offset] ?? dataLength;
      offset += 1;
    } else {
      offset += 1;
    }
  }

  return data.slice(offset, offset + dataLength);
};
