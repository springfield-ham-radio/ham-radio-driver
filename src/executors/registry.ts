import type { ProtocolContext } from "../protocol-context.js";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { StepExecutor } from "./base.js";
import { ReadExecutor } from "./read-executor.js";
import { WriteExecutor } from "./write-executor.js";
import { ExchangeExecutor } from "./exchange-executor.js";

/**
 * Dispatches protocol steps to the first matching executor.
 * Read and write are checked before exchange so nested send/expect fields are not treated as a top-level exchange.
 */
export class StepExecutorRegistry {
  private executors: StepExecutor[] = [];

  constructor() {
    this.executors = [new ReadExecutor(), new WriteExecutor(), new ExchangeExecutor()];
  }

  async executeStep(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    const executor = this.executors.find((exec) => exec.canExecute(step));

    if (!executor) {
      throw new Error(`No executor found for step: ${JSON.stringify(Object.keys(step))}`);
    }

    await executor.execute(step, context);
  }

  registerExecutor(executor: StepExecutor): void {
    this.executors.unshift(executor);
  }
}
