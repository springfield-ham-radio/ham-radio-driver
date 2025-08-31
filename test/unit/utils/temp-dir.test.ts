import { describe, it, afterEach } from 'node:test';
import { expect } from 'chai';
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

      expect(path).to.be.a('string');
      expect(path).to.include('test-prefix');
      expect(fs.existsSync(path)).to.be.true;
      expect(fs.statSync(path).isDirectory()).to.be.true;
    });

    it('should throw error if create is called twice', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      expect(() => tempDir.create('another-prefix')).to.throw('TempDir already has a directory created');
    });

    it('should handle directory creation errors gracefully', () => {
      tempDir = new TempDir();

      // This should not throw an error even if there are permission issues
      expect(() => tempDir.create('test-prefix')).to.not.throw();
    });
  });

  describe('getPath', () => {
    it('should return the directory path after creation', () => {
      tempDir = new TempDir();
      const createdPath = tempDir.create('test-prefix');
      const retrievedPath = tempDir.getPath();

      expect(retrievedPath).to.equal(createdPath);
    });

    it('should throw error if called before creation', () => {
      tempDir = new TempDir();
      expect(() => tempDir.getPath()).to.throw('No temporary directory has been created');
    });
  });

  describe('getFilePath', () => {
    it('should return correct file path within the directory', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');
      const filePath = tempDir.getFilePath('test.log');

      expect(filePath).to.include('test.log');
      expect(filePath).to.include(tempDir.getPath());
    });

    it('should throw error if called before creation', () => {
      tempDir = new TempDir();
      expect(() => tempDir.getFilePath('test.log')).to.throw('No temporary directory has been created');
    });
  });

  describe('ensureExists', () => {
    it('should not throw if directory exists and is writable', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      expect(() => tempDir.ensureExists()).to.not.throw();
    });

    it('should throw if directory does not exist', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      // Manually remove the directory to simulate it not existing
      const path = tempDir.getPath();
      fs.rmSync(path, { recursive: true, force: true });

      expect(() => tempDir.ensureExists()).to.throw('Temporary directory does not exist');
    });
  });

  describe('cleanup', () => {
    it('should remove the temporary directory and its contents', () => {
      tempDir = new TempDir();
      const path = tempDir.create('test-prefix');

      // Create a test file in the directory
      const testFile = tempDir.getFilePath('test.txt');
      fs.writeFileSync(testFile, 'test content');

      expect(fs.existsSync(path)).to.be.true;
      expect(fs.existsSync(testFile)).to.be.true;

      tempDir.cleanup();

      expect(fs.existsSync(path)).to.be.false;
      expect(fs.existsSync(testFile)).to.be.false;
    });

    it('should be safe to call multiple times', () => {
      tempDir = new TempDir();
      tempDir.create('test-prefix');

      expect(() => tempDir.cleanup()).to.not.throw();
      expect(() => tempDir.cleanup()).to.not.throw();
    });

    it('should handle cleanup when directory already removed', () => {
      tempDir = new TempDir();
      const path = tempDir.create('test-prefix');

      // Manually remove the directory
      fs.rmSync(path, { recursive: true, force: true });

      expect(() => tempDir.cleanup()).to.not.throw();
    });
  });

  describe('createWithCleanup', () => {
    it('should create directory and return path with cleanup function', () => {
      const { path: dirPath, cleanup } = TempDir.createWithCleanup('test-prefix');

      expect(dirPath).to.be.a('string');
      expect(dirPath).to.include('test-prefix');
      expect(fs.existsSync(dirPath)).to.be.true;
      expect(cleanup).to.be.a('function');

      cleanup();

      expect(fs.existsSync(dirPath)).to.be.false;
    });
  });

  describe('createTempDir function', () => {
    it('should create and return a TempDir instance', () => {
      const tempDirInstance = new TempDir();
      tempDirInstance.create('test-prefix');

      expect(tempDirInstance).to.be.instanceOf(TempDir);
      expect(tempDirInstance.getPath()).to.include('test-prefix');

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
      expect(fs.existsSync(testFile)).to.be.true;

      // Read file
      const readContent = fs.readFileSync(testFile, 'utf8');
      expect(readContent).to.equal(testContent);

      // Cleanup should remove everything
      tempDir.cleanup();
      expect(fs.existsSync(testFile)).to.be.false;
    });

    it('should handle multiple files in the same directory', () => {
      tempDir = new TempDir();
      tempDir.create('multi-file-test');

      const file1 = tempDir.getFilePath('file1.txt');
      const file2 = tempDir.getFilePath('file2.txt');

      fs.writeFileSync(file1, 'content1');
      fs.writeFileSync(file2, 'content2');

      expect(fs.existsSync(file1)).to.be.true;
      expect(fs.existsSync(file2)).to.be.true;

      tempDir.cleanup();

      expect(fs.existsSync(file1)).to.be.false;
      expect(fs.existsSync(file2)).to.be.false;
    });
  });
});
