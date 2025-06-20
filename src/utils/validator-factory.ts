import type { RadioReceivePattern } from '@springfield/ham-radio-api';
import type { ReceivePatternValidator } from "./receive-pattern-validators.js";
import { ExactReceivePatternValidator, VariableReceivePatternValidator, PatternReceivePatternValidator, AnyReceivePatternValidator } from "./receive-pattern-validators.js";

/**
 * Factory Pattern: Receive Pattern Validator Factory
 *
 * This factory is responsible for creating and managing validators that can handle
 * different types of receive patterns in the ham radio protocol interpreter.
 *
 * Purpose:
 * - Provides a centralized way to obtain the appropriate validator for a given pattern type
 * - Encapsulates the logic for selecting validators based on pattern characteristics
 * - Follows the Factory pattern to decouple pattern creation from pattern validation logic
 * - Ensures that each pattern type has a corresponding validator that can handle it
 *
 * Design Rationale:
 * - Different receive patterns (exact matches, variable values, regex patterns, etc.)
 *   require different validation strategies
 * - The factory pattern allows us to add new pattern types without modifying existing code
 * - Each validator implements a common interface but has specialized validation logic
 * - The factory maintains a registry of all available validators and selects the appropriate one
 *
 * Usage:
 * The factory is used by the protocol interpreter to validate incoming radio responses
 * against expected patterns, ensuring that the communication protocol is followed correctly.
 */
export class ReceivePatternValidatorFactory {
  /**
   * Registry of all available validators.
   * Each validator is responsible for handling a specific pattern type.
   * The order doesn't matter as each validator determines if it can handle a pattern
   * through its `canValidate()` method.
   */
  private static validators: ReceivePatternValidator[] = [
    new ExactReceivePatternValidator(),      // Handles exact string matches
    new VariableReceivePatternValidator(),   // Handles variable placeholders
    new PatternReceivePatternValidator(),    // Handles regex patterns
    new AnyReceivePatternValidator()         // Handles wildcard/any patterns
  ];

  /**
   * Gets the appropriate validator for a given receive pattern.
   *
   * This method iterates through all registered validators and returns the first one
   * that can handle the specified pattern type. This allows for flexible pattern
   * matching where different validators can handle different aspects of pattern validation.
   *
   * @param pattern - The receive pattern that needs validation
   * @returns The validator that can handle this pattern type
   * @throws Error if no validator is found for the pattern type
   *
   * Example:
   * ```typescript
   * const validator = ReceivePatternValidatorFactory.getValidator({
   *   type: 'exact',
   *   value: 'OK'
   * });
   * const isValid = validator.validate('OK', 'OK'); // true
   * ```
   */
  static getValidator(pattern: RadioReceivePattern): ReceivePatternValidator {
    // Find the first validator that can handle this pattern type
    const validator = this.validators.find((v) => v.canValidate(pattern));

    if (!validator) {
      throw new Error(`No validator found for pattern type: ${pattern.type}`);
    }

    return validator;
  }
}
