import type { RadioExchange } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import type { RadioOnErrorCleanup } from "../types/protocol-on-error.js";
import { CleanupBudgetExceededError } from "./protocol-operations.js";
import { isExchangeStep } from "./step-guards.js";
import { executeExchange } from "./step-utils.js";

export const ON_ERROR_CLEANUP_BUDGET_MS = 1500;

const portIsOpenForCleanup = (context: ProtocolContext): boolean => {
  try {
    const port = context.port as { isOpen?: boolean };

    return port.isOpen !== false;
  } catch {
    return false;
  }
};

const safeLog = (context: ProtocolContext, level: "debug" | "warn", message: string): void => {
  try {
    context.logger[level](message);
  } catch {
    // Logging must not replace the original protocol error or abort later steps.
  }
};

export const getOnErrorSteps = (onError: RadioOnErrorCleanup | undefined, operation: "readMemory" | "writeMemory"): RadioExchange[] => {
  const steps = onError?.[operation];

  if (steps === undefined || steps.length === 0) {
    return [];
  }

  return steps;
};

export const runProtocolOnErrorCleanup = async (context: ProtocolContext, steps: RadioExchange[]): Promise<void> => {
  if (steps.length === 0) {
    return;
  }

  if (!portIsOpenForCleanup(context)) {
    safeLog(context, "debug", "Skipping onError cleanup because the serial port is closed");
    return;
  }

  // inCleanup both suppresses cancel checks and blocks re-entry. A cleanup step
  // must not start another onError pass, and the flag stays set until this pass
  // has released its readers.
  if (context.inCleanup) {
    safeLog(context, "warn", "onError cleanup skipped: already in progress");
    return;
  }

  const deadline = Date.now() + ON_ERROR_CLEANUP_BUDGET_MS;
  context.inCleanup = true;

  try {
    for (const step of steps) {
      if (Date.now() >= deadline) {
        safeLog(context, "warn", "onError cleanup stopped: time budget exceeded");
        break;
      }

      if (!portIsOpenForCleanup(context)) {
        safeLog(context, "debug", "Skipping onError cleanup because the serial port is closed");
        break;
      }

      try {
        if (!isExchangeStep(step)) {
          safeLog(context, "warn", `onError cleanup skipped non-exchange step: ${JSON.stringify(Object.keys(step))}`);
          continue;
        }

        await executeExchange(
          {
            deadlineAt: deadline,
            delay: step.delay,
            description: step.description,
            expect: step.expect,
            send: step.send,
            setBaudRate: step.setBaudRate,
            timeout: step.timeout,
          },
          context,
        );
      } catch (cleanupError) {
        if (cleanupError instanceof CleanupBudgetExceededError) {
          safeLog(context, "warn", "onError cleanup stopped: time budget exceeded");
          break;
        }

        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        safeLog(context, "warn", `onError cleanup step failed: ${message}`);
      }
    }
  } finally {
    context.inCleanup = false;
  }
};
