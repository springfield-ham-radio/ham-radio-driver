import type { RadioCatReadStep, RadioCatWriteStep, RadioExchange, RadioProtocolStep, RadioReadStep, RadioWriteStep } from "@springfield/ham-radio-api";

export const isReadStep = (step: RadioProtocolStep): step is RadioReadStep => "read" in step;

export const isWriteStep = (step: RadioProtocolStep): step is RadioWriteStep => "write" in step;

export const isCatReadStep = (step: RadioProtocolStep): step is RadioCatReadStep => "catRead" in step;

export const isCatWriteStep = (step: RadioProtocolStep): step is RadioCatWriteStep => "catWrite" in step;

export const isExchangeStep = (step: RadioProtocolStep): step is RadioExchange =>
  !isReadStep(step) &&
  !isWriteStep(step) &&
  !isCatReadStep(step) &&
  !isCatWriteStep(step) &&
  ("send" in step || "expect" in step || "setBaudRate" in step);
