import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Manages temporary directories for testing with automatic cleanup.
 *
 * This utility provides a more robust way to create and manage temporary
 * directories for tests, with better error handling and cleanup mechanisms.
 */
export class TempDir {
  private dirPath: string | null = null;
  private isCleanedUp = false;

  /**
   * Creates a new temporary directory with the given prefix.
   *
   * @param prefix - Prefix for the temporary directory name
   * @returns The path to the created temporary directory
   *
   * @throws {Error} If directory creation fails
   */
  create(prefix: string): string {
    if (this.dirPath) {
      throw new Error('TempDir already has a directory created');
    }

    try {
      this.dirPath = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
      return this.dirPath;
    } catch (error) {
      throw new Error(`Failed to create temporary directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Gets the path to the temporary directory.
   *
   * @returns The path to the temporary directory
   * @throws {Error} If no directory has been created
   */
  getPath(): string {
    if (!this.dirPath) {
      throw new Error('No temporary directory has been created');
    }
    return this.dirPath;
  }

  /**
   * Creates a file path within the temporary directory.
   *
   * @param filename - Name of the file
   * @returns Full path to the file within the temporary directory
   * @throws {Error} If no directory has been created
   */
  getFilePath(filename: string): string {
    return path.join(this.getPath(), filename);
  }

  /**
   * Ensures the temporary directory exists and is writable.
   *
   * @throws {Error} If directory doesn't exist or is not writable
   */
  ensureExists(): void {
    const dirPath = this.getPath();

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Temporary directory does not exist: ${dirPath}`);
    }

    try {
      // Test write access by creating a temporary file
      const testFile = path.join(dirPath, '.test-write-access');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      throw new Error(`Temporary directory is not writable: ${dirPath}`, error);
    }
  }

  /**
   * Cleans up the temporary directory and all its contents.
   *
   * This method is safe to call multiple times and will only
   * attempt cleanup once.
   */
  cleanup(): void {
    if (this.isCleanedUp || !this.dirPath) {
      return;
    }

    try {
      if (fs.existsSync(this.dirPath)) {
        fs.rmSync(this.dirPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Log the error but don't throw, as cleanup errors shouldn't fail tests
      console.warn(`Warning: Failed to cleanup temporary directory ${this.dirPath}:`, error);
    } finally {
      this.isCleanedUp = true;
      this.dirPath = null;
    }
  }

  /**
   * Creates a temporary directory and returns a cleanup function.
   *
   * This is a convenience method for use in test setup/teardown.
   *
   * @param prefix - Prefix for the temporary directory name
   * @returns Object with the directory path and cleanup function
   *
   * @example
   * ```typescript
   * const { path: tempDir, cleanup } = TempDir.createWithCleanup('my-test');
   * try {
   *   // Use tempDir for testing
   * } finally {
   *   cleanup();
   * }
   * ```
   */
  static createWithCleanup(prefix: string): { path: string; cleanup: () => void } {
    const tempDir = new TempDir();
    const dirPath = tempDir.create(prefix);

    return {
      path: dirPath,
      cleanup: () => tempDir.cleanup(),
    };
  }
}

/**
 * Creates a temporary directory for testing with automatic cleanup.
 *
 * This function is designed to be used in test beforeEach/afterEach hooks.
 *
 * @param prefix - Prefix for the temporary directory name
 * @returns A TempDir instance
 *
 * @example
 * ```typescript
 * let tempDir: TempDir;
 *
 * beforeEach(() => {
 *   tempDir = createTempDir('serial-logger-test');
 * });
 *
 * afterEach(() => {
 *   tempDir.cleanup();
 * });
 * ```
 */
export function createTempDir(prefix: string): TempDir {
  const tempDir = new TempDir();
  tempDir.create(prefix);
  return tempDir;
}
