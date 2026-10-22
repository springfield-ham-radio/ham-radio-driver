/** Thrown when an exchange hits `deadlineAt`. Cleanup treats this as a hard stop. */
export class CleanupBudgetExceededError extends Error {
  constructor() {
    super("onError cleanup stopped: time budget exceeded");
    this.name = "CleanupBudgetExceededError";
  }
}
