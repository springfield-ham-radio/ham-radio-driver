import type { ProtocolContext } from "../protocol-context.js";
import { CancelledException } from "../cancelled-exception.js";

/** Whether the user requested cancel. Ignored while `onError` cleanup is running. */
export const isProtocolCancelled = (context: ProtocolContext): boolean => {
  if (context.inCleanup) {
    return false;
  }

  return context.progressIndicator?.isCanceled === true;
};

export const throwIfProtocolCancelled = (context: ProtocolContext, message: string): void => {
  if (isProtocolCancelled(context)) {
    throw new CancelledException(message);
  }
};
