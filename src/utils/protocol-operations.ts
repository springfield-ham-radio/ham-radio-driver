import type { RadioByteToken, RadioExpect } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import { CancelledException } from "../cancelled-exception.js";
import { ByteLengthParser } from "@serialport/parser-byte-length";
import { extractExpectData, getExpectedLength, matchExpect } from "./expect-matcher.js";
import { resolveSendTokens } from "./token-utils.js";

export interface ExchangeConfig {
  send?: RadioByteToken[];
  expect?: RadioExpect;
  timeout?: number;
  description?: string;
}

const releaseParser = (context: ProtocolContext, parser: ByteLengthParser): void => {
  if (typeof context.port.unpipe === "function") {
    context.port.unpipe(parser);
  }

  parser.removeAllListeners();
};

export abstract class ProtocolOperationTemplate {
  protected abstract validateConfiguration(config: ExchangeConfig): void;
  protected abstract setupParser(config: ExchangeConfig, context: ProtocolContext): ByteLengthParser;
  protected abstract handleData(data: Buffer, config: ExchangeConfig, context: ProtocolContext): Uint8Array;
  protected abstract handleError(error: Error, config: ExchangeConfig): void;
  protected abstract sendData(config: ExchangeConfig, context: ProtocolContext): void;

  async execute(config: ExchangeConfig, context: ProtocolContext): Promise<Uint8Array> {
    this.validateConfiguration(config);

    if (context.progressIndicator?.isCanceled) {
      throw new CancelledException("Protocol operation was cancelled");
    }

    if (config.expect === undefined) {
      this.sendData(config, context);
      return new Uint8Array(0);
    }

    return new Promise((resolve, reject) => {
      const parser = this.setupParser(config, context);

      const timeoutId = setTimeout(() => {
        releaseParser(context, parser);
        reject(new Error(`Timeout waiting for response: ${config.description || "operation"}`));
      }, config.timeout || 5000);

      parser.on("data", (data: Buffer) => {
        clearTimeout(timeoutId);
        releaseParser(context, parser);

        try {
          resolve(this.handleData(data, config, context));
        } catch (error) {
          reject(error);
        }
      });

      parser.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        releaseParser(context, parser);
        this.handleError(error, config);
        reject(error);
      });

      this.sendData(config, context);
    });
  }
}

export class SendReceiveOperation extends ProtocolOperationTemplate {
  protected validateConfiguration(config: ExchangeConfig): void {
    if (config.send === undefined && config.expect === undefined) {
      throw new Error("Exchange requires send and/or expect");
    }
  }

  protected setupParser(config: ExchangeConfig, context: ProtocolContext): ByteLengthParser {
    if (config.expect === undefined) {
      throw new Error("Parser setup requires expect");
    }
    const expectedLength = getExpectedLength(config.expect, context);
    return context.port.pipe(new ByteLengthParser({ length: expectedLength }));
  }

  protected handleData(data: Buffer, config: ExchangeConfig, context: ProtocolContext): Uint8Array {
    context.logger.debug(`Received data: ${data.toString("hex")}`);

    const receivedData = new Uint8Array(data);
    context.variables.set("lastReceivedData", receivedData);
    context.variables.set("lastReceivedDataBuffer", data);

    if (config.expect === undefined) {
      return receivedData;
    }

    if (!matchExpect(data, config.expect, context)) {
      throw new Error(`Invalid response pattern: ${Buffer.from(data).toString("hex")}`);
    }

    return extractExpectData(receivedData, config.expect, context);
  }

  protected handleError(_error: Error, _config: ExchangeConfig): void {
    // Error handling is done in the template method
  }

  protected sendData(config: ExchangeConfig, context: ProtocolContext): void {
    if (config.send === undefined) {
      return;
    }

    const bytes = resolveSendTokens(config.send, context);
    const sendDataArray = new Uint8Array(bytes);
    context.variables.set("lastSentData", sendDataArray);
    context.logger.debug(`Sending data: ${Buffer.from(sendDataArray).toString("hex")}`);
    context.port.write(sendDataArray);
  }
}
