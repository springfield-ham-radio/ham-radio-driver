import type { ProtocolContext } from '../protocol-context.js';
import type { RadioProtocolStep } from '@springfield/ham-radio-api';
import type { StepExecutor } from '../executors/index.js';

// Example: Custom step executor for logging
export class LogStepExecutor implements StepExecutor {
  canExecute = (step: RadioProtocolStep): boolean => {
    return 'log' in step;
  };

  execute = async (step: RadioProtocolStep, context: ProtocolContext): Promise<void> => {
    const config = (step as any).log;
    const { level = 'info', message } = config;

    switch (level) {
      case 'debug':
        context.logger.debug(message);
        break;
      case 'info':
        context.logger.info(message);
        break;
      case 'warn':
        context.logger.warn(message);
        break;
      case 'error':
        context.logger.error(message);
        break;
      default:
        context.logger.info(message);
    }
  };
}

// Example: Custom step executor for conditional execution
export class ConditionalStepExecutor implements StepExecutor {
  canExecute = (step: RadioProtocolStep): boolean => {
    return 'conditional' in step;
  };

  execute = async (step: RadioProtocolStep, context: ProtocolContext): Promise<void> => {
    const config = (step as any).conditional;
    const { condition, ifFalse, ifTrue } = config;

    // Simple condition evaluation (could be more sophisticated)
    const conditionValue = this.evaluateCondition(condition, context);

    if (conditionValue) {
      // Execute ifTrue steps
      for (const trueStep of ifTrue) {
        // This would need to be integrated with the registry
        // For now, just log what would happen
        context.logger.debug(`Executing conditional true step: ${JSON.stringify(trueStep)}`);
      }
    } else if (ifFalse) {
      // Execute ifFalse steps
      for (const falseStep of ifFalse) {
        context.logger.debug(`Executing conditional false step: ${JSON.stringify(falseStep)}`);
      }
    }
  };

  private evaluateCondition = (condition: string, context: ProtocolContext): boolean => {
    // Simple condition evaluation - could be enhanced with a proper expression parser
    if ('hasData' === condition) {
      const lastReceivedData = context.variables.get('lastReceivedData') as Uint8Array | undefined;
      return Boolean(lastReceivedData && 0 < lastReceivedData.length);
    }
    if ('hasSegment' === condition) {
      return context.currentSegment !== undefined;
    }
    return false;
  };
}

// Example: Custom step executor for delay/wait
export class DelayStepExecutor implements StepExecutor {
  canExecute = (step: RadioProtocolStep): boolean => {
    return 'delay' in step;
  };

  execute = async (step: RadioProtocolStep, context: ProtocolContext): Promise<void> => {
    const config = (step as any).delay;
    const { description, duration } = config;

    if (description) {
      context.logger.debug(description);
    }

    await new Promise((resolve) => setTimeout(resolve, duration));
  };
}

// Example usage:
/*
const protocol = {
  readMemory: [
    {
      log: {
        message: "Starting memory read operation",
        level: "info"
      }
    },
    {
      conditional: {
        condition: "hasData",
        ifTrue: [
          { log: { message: "Data available, proceeding", level: "debug" } }
        ],
        ifFalse: [
          { log: { message: "No data available", level: "warn" } }
        ]
      }
    },
    {
      delay: {
        duration: 1000,
        description: "Waiting for radio to be ready"
      }
    },
    // ... other steps
  ]
};

// Register custom executors
const interpreter = new ProtocolInterpreter(context);
interpreter.registerExecutor(new LogStepExecutor());
interpreter.registerExecutor(new ConditionalStepExecutor());
interpreter.registerExecutor(new DelayStepExecutor());
*/
