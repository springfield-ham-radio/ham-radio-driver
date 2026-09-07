import type { ProtocolContext } from "../protocol-context.js";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { CancelledException } from "../cancelled-exception.js";
import { executeExchange } from "../utils/step-utils.js";
import { isCatReadStep } from "../utils/step-guards.js";
import { advanceProgress } from "../utils/progress-utils.js";
import { catEmptyByte, catLineFromResponse, catTimeoutMs, delayMs, getCatPacker } from "../utils/cat-packers.js";
import { StepExecutor } from "./base.js";

const CAT_UNTIL_CR = { until: "0x0D" } as const;

export class CatReadExecutor implements StepExecutor {
  canExecute(step: RadioProtocolStep): boolean {
    return isCatReadStep(step);
  }

  async execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void> {
    if (!isCatReadStep(step)) {
      throw new Error("CatReadExecutor received a non-catRead step");
    }

    if (step.description) {
      context.logger.debug(step.description);
    }

    if (!context.memoryBuffer) {
      throw new Error("Memory buffer not initialized in context");
    }

    const config = step.catRead;
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
        throw new CancelledException("Radio CAT read was cancelled");
      }

      const recordOffset = segmentConfig.startAddress + index * config.recordSize;

      if (recordOffset + config.recordSize > context.memoryBuffer.length) {
        throw new Error(`CAT record ${index} exceeds memory buffer`);
      }

      context.currentSegment.currentAddress = recordOffset;

      const memoryLine = await this.exchangeLine(packer.memoryReadCommand(index), timeout, context, delay);
      let nameLine = "";
      let splitLine: string | undefined;

      if (packer.isOccupied(memoryLine)) {
        nameLine = await this.exchangeLine(packer.nameReadCommand(index), timeout, context, delay);
        const packedPreview = packer.packRead(memoryLine, nameLine, undefined, emptyByte);

        if (packedPreview[18] === 1 || packedPreview[9] === 3) {
          splitLine = await this.exchangeLine(packer.splitReadCommand(index), timeout, context, delay);
        }
      }

      const record = packer.packRead(memoryLine, nameLine, splitLine, emptyByte);
      context.memoryBuffer.set(record, recordOffset);
      advanceProgress(context);
    }
  }

  private async exchangeLine(send: number[], timeout: number, context: ProtocolContext, delay: number): Promise<string> {
    await delayMs(delay);
    const response = await executeExchange({ expect: CAT_UNTIL_CR, send, timeout }, context);
    return catLineFromResponse(response);
  }
}
