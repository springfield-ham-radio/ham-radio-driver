import type { RadioMemorySegment } from "@springfield/ham-radio-api";
import {
  applyKenwoodThF6SettingRead,
  isKenwoodCatError,
  kenwoodSettingReadCommand,
  kenwoodThF6SettingCommands,
  kenwoodThF6SettingWriteCommands,
  markKenwoodThF6SettingsLoaded,
} from "./kenwood-th-f6-cat.js";

export const readKenwoodThF6Settings = async (
  memoryBuffer: Uint8Array,
  settingsSegment: RadioMemorySegment,
  exchangeLine: (send: number[]) => Promise<string>,
): Promise<number> => {
  markKenwoodThF6SettingsLoaded(memoryBuffer, false);

  let successes = 0;

  for (const command of kenwoodThF6SettingCommands()) {
    const line = await exchangeLine(kenwoodSettingReadCommand(command));

    if (applyKenwoodThF6SettingRead(memoryBuffer, command, line)) {
      successes += 1;
    }
  }

  if (successes === kenwoodThF6SettingCommands().length) {
    markKenwoodThF6SettingsLoaded(memoryBuffer, true);
  }

  if (settingsSegment.endAddress >= memoryBuffer.length) {
    throw new Error("Settings segment exceeds memory buffer");
  }

  return successes;
};

export const writeKenwoodThF6Settings = async (
  memoryBuffer: Uint8Array,
  exchangeLine: (send: number[]) => Promise<string>,
): Promise<void> => {
  for (const command of kenwoodThF6SettingWriteCommands(memoryBuffer)) {
    const line = await exchangeLine(command);

    if (isKenwoodCatError(line)) {
      continue;
    }
  }
};
