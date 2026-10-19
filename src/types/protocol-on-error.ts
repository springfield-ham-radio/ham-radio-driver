import type { Radio, RadioExchange } from "@springfield/ham-radio-api";

/**
 * Optional cleanup exchanges per memory operation.
 * Shipped on `Radio` in @springfield/ham-radio-api 18.3.0; remove this shim after upgrading.
 */
export type RadioOnErrorCleanup = {
  readMemory?: RadioExchange[];
  writeMemory?: RadioExchange[];
};

export type RadioProtocolWithOnError = Radio & {
  onError?: RadioOnErrorCleanup;
};
