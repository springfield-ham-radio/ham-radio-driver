import type { ProtocolContext } from "../protocol-context.js";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { executeExchange } from "../utils/step-utils.js";
import { isExchangeStep } from "../utils/step-guards.js";
import { advanceProgress } from "../utils/progress-utils.js";
import { StepExecutor } from "./base.js";

export class ExchangeExecutor implements StepExecutor {
  canExecute(step: RadioProtocolStep): boolean {
    return isExchangeStep(step);
  }

  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    if (!isExchangeStep(step)) {
      throw new Error("ExchangeExecutor received a non-exchange step");
    }

    if (step.description) {
      context.logger.debug(step.description);
    }

    await executeExchange(
      {
        description: step.description,
        expect: step.expect,
        send: step.send,
        timeout: step.timeout,
      },
      context,
    );

    advanceProgress(context);
  }
}
