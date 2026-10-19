import type { RadioExchange } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "../protocol-context.js";
import type { RadioOnErrorCleanup } from "../types/protocol-on-error.js";
import { isExchangeStep } from "./step-guards.js";
import { executeExchange } from "./step-utils.js";

export const ON_ERROR_CLEANUP_BUDGET_MS = 1500;

const portIsOpenForCleanup = (context: ProtocolContext): boolean => {
  const port = context.port as { isOpen?: boolean };

  return port.isOpen !== false;
};

export const getOnErrorSteps = (
  onError: RadioOnErrorCleanup | undefined,
  operation: "readMemory" | "writeMemory",
): RadioExchange[] => {
  const steps = onError?.[operation];

  if (steps === undefined || steps.length === 0) {
    return [];
  }

  return steps;
};

export const runProtocolOnErrorCleanup = async (
  context: ProtocolContext,
  steps: RadioExchange[],
): Promise<void> => {
  if (steps.length === 0) {
    return;
  }

  if (!portIsOpenForCleanup(context)) {
    context.logger.debug("Skipping onError cleanup because the serial port is closed");
    return;
  }

  const deadline = Date.now() + ON_ERROR_CLEANUP_BUDGET_MS;
  context.inCleanup = true;

  try {
    for (const step of steps) {
      if (Date.now() >= deadline) {
        context.logger.warn("onError cleanup stopped: time budget exceeded");
        break;
      }

      if (!isExchangeStep(step)) {
        context.logger.warn(`onError cleanup skipped non-exchange step: ${JSON.stringify(Object.keys(step))}`);
        continue;
      }

      try {
        await executeExchange(
          {
            description: step.description,
            delay: step.delay,
            expect: step.expect,
            send: step.send,
            setBaudRate: step.setBaudRate,
            timeout: step.timeout,
          },
          context,
        );
      } catch (cleanupError) {
        const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
        context.logger.warn(`onError cleanup step failed: ${message}`);
      }
    }
  } finally {
    context.inCleanup = false;
  }
};
