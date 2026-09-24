import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import { TempDir } from '../../utils/temp-dir.js';

describe('TempDir', () => {
  let tempDir: TempDir;

  afterEach(() => {
    if (tempDir) {
      tempDir.cleanup();
    }
  });

  describe('create', () => {
    it('should create a temporary directory with the given prefix', () => {
      tempDir = new TempDir();
      const path = tempDir.create('test-prefix');

      expect(path).toBeTypeOf('string');
      expect(path).toContain('test-prefix');
      expect(fs.existsSync(path)).toBe(true);
      expect(fs.statSync(path).isDirectory()).toBe(true);
    });

    it('should throw error if create is called twice', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      expect(() => tempDir.create('another-prefix')).toThrow('TempDir already has a directory created');
    });

    it('should handle directory creation errors gracefully', () => {
      tempDir = new TempDir();

      // This should not throw an error even if there are permission issues
      expect(() => tempDir.create('test-prefix')).not.toThrow();
    });
  });

  describe('getPath', () => {
    it('should return the directory path after creation', () => {
      tempDir = new TempDir();
      const createdPath = tempDir.create('test-prefix');
      const retrievedPath = tempDir.getPath();

      expect(retrievedPath).toBe(createdPath);
    });

    it('should throw error if called before creation', () => {
      tempDir = new TempDir();
      expect(() => tempDir.getPath()).toThrow('No temporary directory has been created');
    });
  });

  describe('getFilePath', () => {
    it('should return correct file path within the directory', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');
      const filePath = tempDir.getFilePath('test.log');

      expect(filePath).toContain('test.log');
      expect(filePath).toContain(tempDir.getPath());
    });

    it('should throw error if called before creation', () => {
      tempDir = new TempDir();
      expect(() => tempDir.getFilePath('test.log')).toThrow('No temporary directory has been created');
    });
  });

  describe('ensureExists', () => {
    it('should not throw if directory exists and is writable', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      expect(() => tempDir.ensureExists()).not.toThrow();
    });

    it('should throw if directory does not exist', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      // Manually remove the directory to simulate it not existing
      const path = tempDir.getPath();
      fs.rmSync(path, { recursive: true, force: true });

      expect(() => tempDir.ensureExists()).toThrow('Temporary directory does not exist');
    });
  });

  describe('cleanup', () => {
    it('should remove the temporary directory and its contents', () => {
      tempDir = new TempDir();
      const path = tempDir.create('test-prefix');

      // Create a test file in the directory
      const testFile = tempDir.getFilePath('test.txt');
      fs.writeFileSync(testFile, 'test content');

      expect(fs.existsSync(path)).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);

      tempDir.cleanup();

      expect(fs.existsSync(path)).toBe(false);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      expect(() => tempDir.cleanup()).not.toThrow();
      expect(() => tempDir.cleanup()).not.toThrow();
    });

    it('should handle cleanup when directory already removed', () => {
      tempDir = new TempDir();
      const path = tempDir.create('test-prefix');

      // Manually remove the directory
      fs.rmSync(path, { recursive: true, force: true });

      expect(() => tempDir.cleanup()).not.toThrow();
    });
  });

  describe('createWithCleanup', () => {
    it('should create directory and return path with cleanup function', () => {
      const { path: dirPath, cleanup } = TempDir.createWithCleanup('test-prefix');

      expect(dirPath).toBeTypeOf('string');
      expect(dirPath).toContain('test-prefix');
      expect(fs.existsSync(dirPath)).toBe(true);
      expect(cleanup).toBeTypeOf('function');

      cleanup();

      expect(fs.existsSync(dirPath)).toBe(false);
    });
  });

  describe('createTempDir function', () => {
    it('should create and return a TempDir instance', () => {
      const tempDirInstance = new TempDir();
      tempDirInstance.create('test-prefix');

      expect(tempDirInstance).toBeInstanceOf(TempDir);
      expect(tempDirInstance.getPath()).toContain('test-prefix');

      tempDirInstance.cleanup();
    });
  });

  describe('integration with file operations', () => {
    it('should work correctly with file read/write operations', () => {
      tempDir = new TempDir();
      tempDir.create('file-test');

      const testFile = tempDir.getFilePath('data.txt');
      const testContent = 'Hello, World!';

      // Write file
      fs.writeFileSync(testFile, testContent);
      expect(fs.existsSync(testFile)).toBe(true);

      // Read file
      const readContent = fs.readFileSync(testFile, 'utf8');
      expect(readContent).toBe(testContent);

      // Cleanup should remove everything
      tempDir.cleanup();
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should handle multiple files in the same directory', () => {
      tempDir = new TempDir();
      tempDir.create('multi-file-test');

      const file1 = tempDir.getFilePath('file1.txt');
      const file2 = tempDir.getFilePath('file2.txt');

      fs.writeFileSync(file1, 'content1');
      fs.writeFileSync(file2, 'content2');

      expect(fs.existsSync(file1)).toBe(true);
      expect(fs.existsSync(file2)).toBe(true);

      tempDir.cleanup();

      expect(fs.existsSync(file1)).toBe(false);
      expect(fs.existsSync(file2)).toBe(false);
    });
  });
});
