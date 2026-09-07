import type { ProtocolContext } from "../protocol-context.js";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { CancelledException } from "../cancelled-exception.js";
import { executeExchange } from "../utils/step-utils.js";
import { isCatWriteStep } from "../utils/step-guards.js";
import { advanceProgress } from "../utils/progress-utils.js";
import { catEmptyByte, catLineFromResponse, catTimeoutMs, delayMs, getCatPacker } from "../utils/cat-packers.js";
import { StepExecutor } from "./base.js";

const CAT_UNTIL_CR = { until: "0x0D" } as const;

export class CatWriteExecutor implements StepExecutor {
  canExecute(step: RadioProtocolStep): boolean {
    return isCatWriteStep(step);
  }

  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    if (!isCatWriteStep(step)) {
      throw new Error("CatWriteExecutor received a non-catWrite step");
    }

    if (step.description) {
      context.logger.debug(step.description);
    }

    if (!context.memoryBuffer) {
      throw new Error("Memory buffer not initialized in context");
    }

    const config = step.catWrite;
    const segmentConfig = context.memoryConfig.segments[config.segment];

    if (!segmentConfig) {
      throw new Error(`Segment '${config.segment}' not found in memory config`);
    }

    const packer = getCatPacker(config.pack);
    const timeout = catTimeoutMs(config);
    const emptyByte = catEmptyByte(config);
    const delay = config.interCommandDelayMs ?? 0;

    context.currentSegment = {
      config: segmentConfig,
      currentAddress: segmentConfig.startAddress,
      name: config.segment,
    };

    for (let index = 0; index < config.count; index++) {
      if (context.progressIndicator?.isCanceled) {
        throw new CancelledException("Radio CAT write was cancelled");
      }

      const recordOffset = segmentConfig.startAddress + index * config.recordSize;

      if (recordOffset + config.recordSize > context.memoryBuffer.length) {
        throw new Error(`CAT record ${index} exceeds memory buffer`);
      }

      context.currentSegment.currentAddress = recordOffset;
      const record = context.memoryBuffer.slice(recordOffset, recordOffset + config.recordSize);

      await this.exchangeLine(packer.memoryWriteCommand(index, record, emptyByte), timeout, context, delay);

      const nameCommand = packer.nameWriteCommand(index, record);

      if (nameCommand) {
        await this.exchangeLine(nameCommand, timeout, context, delay);
      }

      const splitCommand = packer.splitWriteCommand(index, record);

      if (splitCommand) {
        await this.exchangeLine(splitCommand, timeout, context, delay);
      }

      advanceProgress(context);
    }
  }

  private async exchangeLine(send: number[], timeout: number, context: ProtocolContext, delay: number): Promise<string> {
    await delayMs(delay);
    const response = await executeExchange({ expect: CAT_UNTIL_CR, send, timeout }, context);
    return catLineFromResponse(response);
  }
}
