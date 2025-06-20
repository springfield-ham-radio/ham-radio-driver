import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';

// Base interface for step executors
export interface StepExecutor {
  canExecute(step: RadioProtocolStep): boolean;
  execute(step: RadioProtocolStep, context: ProtocolContext): Promise<void>;
}
