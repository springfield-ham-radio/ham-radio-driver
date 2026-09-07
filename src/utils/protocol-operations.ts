import type { RadioByteToken, RadioExpect } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import { CancelledException } from "../cancelled-exception.js";
import { ByteLengthParser } from "@serialport/parser-byte-length";
import { extractExpectData, getExpectedLength, matchExpect } from "./expect-matcher.js";
import { isExpectUntil, parseLiteralByte, resolveSendTokens } from "./token-utils.js";

export interface ExchangeConfig {
  send?: RadioByteToken[];
  expect?: RadioExpect;
  timeout?: number;
  delay?: number;
  description?: string;
  setBaudRate?: number;
}

const releaseParser = (context: ProtocolContext, parser: ByteLengthParser): void => {
  if (typeof context.port.unpipe === "function") {
    context.port.unpipe(parser);
  }

  parser.removeAllListeners();
};

const asDataListenerTarget = (
  port: ProtocolContext["port"],
): { on: (event: string, listener: (data: Buffer) => void) => void; off: (event: string, listener: (data: Buffer) => void) => void } => {
  const candidate = port as unknown as {
    on?: (event: string, listener: (data: Buffer) => void) => void;
    off?: (event: string, listener: (data: Buffer) => void) => void;
    addListener?: (event: string, listener: (data: Buffer) => void) => void;
    removeListener?: (event: string, listener: (data: Buffer) => void) => void;
  };

  const on = candidate.on ?? candidate.addListener;
  const off = candidate.off ?? candidate.removeListener;

  if (on === undefined || off === undefined) {
    throw new Error("Serial port does not support data event listeners");
  }

  return { on, off };
};

/**
 * Read bytes from the port until `delimiter`, excluding the delimiter.
 * Line feeds are ignored so CR-LF CAT replies do not leave a stray LF for the next command.
 */
export const readUntilDelimiter = (
  context: ProtocolContext,
  delimiter: number,
  timeoutMs: number,
  description?: string,
): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const chunks: number[] = [];
    const { on, off } = asDataListenerTarget(context.port);

    const onData = (data: Buffer | Uint8Array): void => {
      for (const byte of data) {
        if (byte === 0x0a) {
          continue;
        }

        if (byte === delimiter) {
          // A bare CR is a Kenwood wake/flush echo, not a command reply.
          if (chunks.length === 0) {
            continue;
          }

          finish();
          resolve(Uint8Array.from(chunks));
          return;
        }

        chunks.push(byte);
      }
    };

    const finish = (): void => {
      clearTimeout(timeoutId);
      off.call(context.port, "data", onData);
    };

    const timeoutId = setTimeout(() => {
      finish();
      reject(new Error(`Timeout waiting for delimiter: ${description || "operation"}`));
    }, timeoutMs);

    on.call(context.port, "data", onData);
  });

const delayMs = async (milliseconds: number | undefined): Promise<void> => {
  if (milliseconds === undefined || milliseconds <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

export abstract class ProtocolOperationTemplate {
  protected abstract validateConfiguration(config: ExchangeConfig): void;
  protected abstract setupParser(config: ExchangeConfig, context: ProtocolContext): ByteLengthParser;
  protected abstract handleData(data: Buffer, config: ExchangeConfig, context: ProtocolContext): Uint8Array;
  protected abstract handleError(error: Error, config: ExchangeConfig): void;
  protected abstract sendData(config: ExchangeConfig, context: ProtocolContext): void | Promise<void>;

  async execute(config: ExchangeConfig, context: ProtocolContext): Promise<Uint8Array> {
    this.validateConfiguration(config);

    if (context.progressIndicator?.isCanceled) {
      throw new CancelledException("Protocol operation was cancelled");
    }

    if (config.setBaudRate !== undefined && typeof context.port.update === "function") {
      context.logger.debug(`Switching baud rate to ${config.setBaudRate}`);
      await context.port.update({ baudRate: config.setBaudRate });
    }

    if (config.expect === undefined) {
      await this.sendData(config, context);
      await delayMs(config.delay);
      return new Uint8Array(0);
    }

    if (isExpectUntil(config.expect)) {
      const delimiter = parseLiteralByte(config.expect.until);

      if (delimiter === undefined) {
        throw new Error(`Invalid until delimiter: ${String(config.expect.until)}`);
      }

      const pending = readUntilDelimiter(context, delimiter, config.timeout || 5000, config.description);
      await this.sendData(config, context);
      await delayMs(config.delay);
      const payload = await pending;
      return this.handleData(Buffer.from(payload), config, context);
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

      void Promise.resolve(this.sendData(config, context))
        .then(() => delayMs(config.delay))
        .catch(reject);
    });
  }
}

export class SendReceiveOperation extends ProtocolOperationTemplate {
  protected validateConfiguration(config: ExchangeConfig): void {
    if (config.send === undefined && config.expect === undefined && config.setBaudRate === undefined) {
      throw new Error("Exchange requires send, expect, and/or setBaudRate");
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

  protected async sendData(config: ExchangeConfig, context: ProtocolContext): Promise<void> {
    if (config.send === undefined) {
      return;
    }

    const bytes = resolveSendTokens(config.send, context);
    const sendDataArray = new Uint8Array(bytes);
    context.variables.set("lastSentData", sendDataArray);
    context.logger.debug(`Sending data: ${Buffer.from(sendDataArray).toString("hex")}`);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error | null) => {
        if (settled) {
          return;
        }

        settled = true;

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      context.port.write(sendDataArray, finish);

      if (context.port.write.length < 2) {
        finish();
      }
    });
  }
}
