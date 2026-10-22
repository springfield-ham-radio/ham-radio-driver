import type { RadioByteToken, RadioExpect } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import { throwIfProtocolCancelled } from "./cancel-guard.js";
import { extractExpectData, getExpectedLength, matchExpect } from "./expect-matcher.js";
import { CleanupBudgetExceededError } from "./cleanup-budget-error.js";
import { readFixedLengthWithResidue } from "./port-receive-residue.js";
import { isExpectUntil, parseLiteralByte, resolveSendTokens } from "./token-utils.js";

export { CleanupBudgetExceededError };

export interface ExchangeConfig {
  send?: RadioByteToken[];
  expect?: RadioExpect;
  timeout?: number;
  delay?: number;
  description?: string;
  setBaudRate?: number;
  /**
   * Absolute timestamp. Cleanup passes this so a wedged write, delay, or expect
   * cannot run past the shared onError budget. Normal exchanges leave it unset.
   */
  deadlineAt?: number;
}

const throwIfBudgetExceeded = (deadlineAt: number | undefined): void => {
  if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
    throw new CleanupBudgetExceededError();
  }
};

const boundedTimeoutMs = (timeout: number | undefined, deadlineAt: number | undefined): number => {
  const configured = timeout ?? 5000;

  if (deadlineAt === undefined) {
    return configured;
  }

  return Math.max(0, Math.min(configured, deadlineAt - Date.now()));
};

/**
 * Stop waiting for `work` when the cleanup budget is gone.
 * A late rejection from `work` is swallowed so it cannot replace the caller's error.
 */
const awaitWithDeadline = async <T>(work: Promise<T>, deadlineAt: number | undefined): Promise<T> => {
  if (deadlineAt === undefined) {
    return work;
  }

  const remaining = deadlineAt - Date.now();

  if (remaining <= 0) {
    void work.catch(() => {
      // Already past the budget; ignore a late rejection.
    });
    throw new CleanupBudgetExceededError();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new CleanupBudgetExceededError());
    }, remaining);
  });

  void work.catch(() => {
    // If the budget wins the race, `work` may reject later.
  });

  try {
    return await Promise.race([work, budget]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

const asDataListenerTarget = (port: ProtocolContext["port"]): { on: (event: string, listener: (data: Buffer) => void) => void; off: (event: string, listener: (data: Buffer) => void) => void } => {
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

type DelimiterRead = {
  promise: Promise<Uint8Array>;
  cancel: () => void;
};

const startReadUntilDelimiter = (context: ProtocolContext, delimiter: number, timeoutMs: number, description: string | undefined, deadlineAt: number | undefined): DelimiterRead => {
  let settled = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectRead: (error: Error) => void = () => undefined;
  const chunks: number[] = [];
  const { on, off } = asDataListenerTarget(context.port);

  const detach = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    try {
      off.call(context.port, "data", onData);
    } catch {
      // The port may already be closed.
    }
  };

  const finish = (): boolean => {
    if (settled) {
      return false;
    }

    settled = true;
    detach();
    return true;
  };

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

        if (finish()) {
          resolveRead(Uint8Array.from(chunks));
        }
        return;
      }

      chunks.push(byte);
    }
  };

  let resolveRead: (value: Uint8Array) => void = () => undefined;

  const promise = new Promise<Uint8Array>((resolve, reject) => {
    resolveRead = resolve;
    rejectRead = reject;

    timeoutId = setTimeout(() => {
      if (!finish()) {
        return;
      }

      if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
        reject(new CleanupBudgetExceededError());
        return;
      }

      reject(new Error(`Timeout waiting for delimiter: ${description || "operation"}`));
    }, timeoutMs);

    on.call(context.port, "data", onData);
  });

  return {
    promise,
    cancel: () => {
      if (finish()) {
        rejectRead(new Error("Read cancelled"));
      }
    },
  };
};

/**
 * Read bytes from the port until `delimiter`, excluding the delimiter.
 * Line feeds are ignored so CR-LF CAT replies do not leave a stray LF for the next command.
 */
export const readUntilDelimiter = (context: ProtocolContext, delimiter: number, timeoutMs: number, description?: string): Promise<Uint8Array> => startReadUntilDelimiter(context, delimiter, timeoutMs, description, undefined).promise;

const delayMs = async (milliseconds: number | undefined, deadlineAt?: number): Promise<void> => {
  if (milliseconds === undefined || milliseconds <= 0) {
    return;
  }

  let wait = milliseconds;

  if (deadlineAt !== undefined) {
    const remaining = deadlineAt - Date.now();

    if (remaining <= 0) {
      throw new CleanupBudgetExceededError();
    }

    wait = Math.min(wait, remaining);
  }

  await new Promise((resolve) => {
    setTimeout(resolve, wait);
  });

  throwIfBudgetExceeded(deadlineAt);
};

export abstract class ProtocolOperationTemplate {
  protected abstract validateConfiguration(config: ExchangeConfig): void;
  protected abstract handleData(data: Buffer, config: ExchangeConfig, context: ProtocolContext): Uint8Array;
  protected abstract handleError(error: Error, config: ExchangeConfig): void;
  protected abstract sendData(config: ExchangeConfig, context: ProtocolContext): void | Promise<void>;

  async execute(config: ExchangeConfig, context: ProtocolContext): Promise<Uint8Array> {
    this.validateConfiguration(config);

    throwIfProtocolCancelled(context, "Protocol operation was cancelled");
    throwIfBudgetExceeded(config.deadlineAt);

    if (config.setBaudRate !== undefined && typeof context.port.update === "function") {
      context.logger.debug(`Switching baud rate to ${config.setBaudRate}`);
      await awaitWithDeadline(Promise.resolve(context.port.update({ baudRate: config.setBaudRate })), config.deadlineAt);
    }

    throwIfBudgetExceeded(config.deadlineAt);

    if (config.expect === undefined) {
      await this.sendData(config, context);
      await delayMs(config.delay, config.deadlineAt);
      return new Uint8Array(0);
    }

    if (isExpectUntil(config.expect)) {
      const delimiter = parseLiteralByte(config.expect.until);

      if (delimiter === undefined) {
        throw new Error(`Invalid until delimiter: ${String(config.expect.until)}`);
      }

      const pending = startReadUntilDelimiter(context, delimiter, boundedTimeoutMs(config.timeout, config.deadlineAt), config.description, config.deadlineAt);
      // A send/delay failure must not leave this read pending, and cancelling it
      // must not surface as an unhandled rejection.
      void pending.promise.catch(() => undefined);

      try {
        await this.sendData(config, context);
        await delayMs(config.delay, config.deadlineAt);
        const payload = await pending.promise;
        return this.handleData(Buffer.from(payload), config, context);
      } catch (error) {
        pending.cancel();
        throw error;
      }
    }

    const expectedLength = getExpectedLength(config.expect, context);
    const pending = readFixedLengthWithResidue(
      context,
      expectedLength,
      boundedTimeoutMs(config.timeout, config.deadlineAt),
      config.description,
      config.deadlineAt,
    );
    void pending.promise.catch(() => undefined);

    const sendWork = Promise.resolve(this.sendData(config, context))
      .then(() => delayMs(config.delay, config.deadlineAt))
      .catch((error: unknown) => {
        pending.release();
        throw error;
      });

    try {
      const payload = await Promise.all([pending.promise, sendWork]).then(([frame]) => frame);
      return this.handleData(payload, config, context);
    } catch (error) {
      pending.release();
      throw error;
    }
  }
}

export class SendReceiveOperation extends ProtocolOperationTemplate {
  protected validateConfiguration(config: ExchangeConfig): void {
    if (config.send === undefined && config.expect === undefined && config.setBaudRate === undefined) {
      throw new Error("Exchange requires send, expect, and/or setBaudRate");
    }
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
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (error?: Error | null) => {
        if (settled) {
          return;
        }

        settled = true;

        if (timer !== undefined) {
          clearTimeout(timer);
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      };

      if (config.deadlineAt !== undefined) {
        const remaining = config.deadlineAt - Date.now();

        if (remaining <= 0) {
          finish(new CleanupBudgetExceededError());
          return;
        }

        timer = setTimeout(() => {
          finish(new CleanupBudgetExceededError());
        }, remaining);
      }

      try {
        context.port.write(sendDataArray, finish);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      if (context.port.write.length < 2) {
        finish();
      }
    });
  }
}
