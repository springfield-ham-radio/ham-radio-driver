import type { ProtocolContext } from "../protocol-context.js";
import type { RadioByteToken, RadioExpect } from "@springfield/ham-radio-api";
import { SendReceiveOperation, type ExchangeConfig } from "./protocol-operations.js";
import { extractExpectData } from "./expect-matcher.js";

export const extractDataFromResponse = (data: Uint8Array, expect: RadioExpect, context: ProtocolContext): Uint8Array =>
  extractExpectData(data, expect, context);

export const executeExchange = async (config: ExchangeConfig, context: ProtocolContext): Promise<Uint8Array> => {
  const operation = new SendReceiveOperation();

  if (config.description) {
    context.logger.debug(config.description);
  }

  return operation.execute(config, context);
};

export const executeSendReceive = async (
  config: { send?: RadioByteToken[]; expect?: RadioExpect; timeout?: number; description?: string },
  context: ProtocolContext,
): Promise<Uint8Array> => executeExchange(config, context);
