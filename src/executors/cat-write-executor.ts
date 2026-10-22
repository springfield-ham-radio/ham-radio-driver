import type { ProtocolContext } from "../protocol-context.js";
import type { RadioProtocolStep } from "@springfield/ham-radio-api";
import { throwIfProtocolCancelled } from "../utils/cancel-guard.js";
import { executeExchange } from "../utils/step-utils.js";
import { isCatWriteStep } from "../utils/step-guards.js";
import { advanceProgress } from "../utils/progress-utils.js";
import { catEmptyByte, catLineFromResponse, catTimeoutMs, delayMs, getCatPacker } from "../utils/cat-packers.js";
import { isKenwoodCatError, kenwoodThF6SettingWriteCommands, kenwoodThF6SettingsLoaded } from "../utils/kenwood-th-f6-cat.js";
import { writeKenwoodThF6Settings } from "../utils/kenwood-th-f6-settings-io.js";
import { StepExecutor } from "./base.js";

interface CatWriteRejection {
  index: number;
  command: string;
  reply: string;
}

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

    const rejections: CatWriteRejection[] = [];

    for (let index = 0; index < config.count; index++) {
      throwIfProtocolCancelled(context, "Radio CAT write was cancelled");

      const recordOffset = segmentConfig.startAddress + index * config.recordSize;

      if (recordOffset + config.recordSize > context.memoryBuffer.length) {
        throw new Error(`CAT record ${index} exceeds memory buffer`);
      }

      context.currentSegment.currentAddress = recordOffset;
      const record = context.memoryBuffer.slice(recordOffset, recordOffset + config.recordSize);

      const memoryLine = await this.exchangeLine(packer.memoryWriteCommand(index, record, emptyByte), timeout, context, delay);

      if (isKenwoodCatError(memoryLine)) {
        rejections.push({ index, command: "MW", reply: memoryLine });
        advanceProgress(context);
        continue;
      }

      const nameCommand = packer.nameWriteCommand(index, record);

      if (nameCommand) {
        const nameLine = await this.exchangeLine(nameCommand, timeout, context, delay);

        if (isKenwoodCatError(nameLine)) {
          rejections.push({ index, command: "MNA", reply: nameLine });
        }
      }

      const splitCommand = packer.splitWriteCommand(index, record);

      if (splitCommand) {
        const splitLine = await this.exchangeLine(splitCommand, timeout, context, delay);

        if (isKenwoodCatError(splitLine)) {
          rejections.push({ index, command: "MW split", reply: splitLine });
        }
      }

      advanceProgress(context);
    }

    if (rejections.length > 0) {
      const channels = [...new Set(rejections.map((rejection) => rejection.index))].sort((left, right) => left - right);
      const details = rejections.map((rejection) => `${rejection.index} (${rejection.command} replied ${rejection.reply || "empty"})`).join("; ");
      throw new Error(`Radio rejected channels ${channels.join(", ")}: ${details}`);
    }

    if (config.pack === "kenwood-th-f6" && context.memoryConfig.segments.settings && kenwoodThF6SettingsLoaded(context.memoryBuffer)) {
      const settingsCommands = kenwoodThF6SettingWriteCommands(context.memoryBuffer);
      await writeKenwoodThF6Settings(context.memoryBuffer, async (send) => this.exchangeLine(send, timeout, context, delay));
      advanceProgress(context, settingsCommands.length);
    }
  }

  private async exchangeLine(send: number[], timeout: number, context: ProtocolContext, delay: number): Promise<string> {
    await delayMs(delay);
    const response = await executeExchange({ expect: CAT_UNTIL_CR, send, timeout }, context);
    return catLineFromResponse(response);
  }
}
