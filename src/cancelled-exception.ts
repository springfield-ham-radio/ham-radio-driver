/**
 * Exception thrown when an operation is cancelled
 *
 * This exception is used throughout the ham radio driver system to indicate
 * that an operation has been intentionally cancelled, typically by user
 * intervention or system timeout. It extends the standard Error class
 * and provides a consistent way to handle cancellation scenarios.
 *
 * @example
 * ```typescript
 * try {
 *   await radioDriver.sendCommand('AT+TEST');
 * } catch (error) {
 *   if (error instanceof CancelledException) {
 *     console.log('Operation was cancelled by user');
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Throwing with custom message
 * throw new CancelledException('Radio communication timeout');
 *
 * // Throwing with default message
 * throw new CancelledException();
 * ```
 */
export class CancelledException extends Error {
  /**
   * Creates a new CancelledException instance
   *
   * @param message - Optional custom error message. Defaults to 'Operation was cancelled'
   *
   * @example
   * ```typescript
   * const exception = new CancelledException('User cancelled the operation');
   * console.log(exception.message); // 'User cancelled the operation'
   * console.log(exception.name); // 'CancelledException'
   * ```
   */
  constructor(message: string = 'Operation was cancelled') {
    super(message);
    this.name = 'CancelledException';
  }
}
