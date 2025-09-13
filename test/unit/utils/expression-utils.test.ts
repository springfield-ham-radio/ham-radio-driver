import { describe, it, beforeEach } from 'node:test';
import { expect } from 'chai';
import { resolveExpression, resolveExpressions } from '@src/utils/expression-utils.js';
import type { ProtocolContext } from '@src/protocol-context.js';
import { ProtocolContextFactory, Uint8ArrayFactory } from './test-factories.js';

describe('expression-utils', () => {
  let mockContext: ProtocolContext;

  beforeEach(() => {
    mockContext = ProtocolContextFactory.build({
      variables: new Map([
        ['segment.data', Uint8ArrayFactory.build()],
        ['lastReceivedData', new Uint8Array([0x04, 0x05, 0x06])]
      ])
    });
  });

  describe('resolveExpression()', () => {
    it('should return numbers unchanged', () => {
      expect(resolveExpression(123, mockContext)).to.equal(123);
      expect(resolveExpression(0x01, mockContext)).to.equal(1);
      expect(resolveExpression(0xFF, mockContext)).to.equal(255);
      expect(resolveExpression(0, mockContext)).to.equal(0);
    });

    it('should resolve context variable references', () => {
      expect(resolveExpression('address', mockContext)).to.equal(0x1000);
      expect(resolveExpression('segment.chunkSize', mockContext)).to.equal(64);
      expect(resolveExpression('segment.startAddress', mockContext)).to.equal(0x1000);
      expect(resolveExpression('segment.endAddress', mockContext)).to.equal(0x2000);
      expect(resolveExpression('segment.data', mockContext)).to.deep.equal(Uint8ArrayFactory.build());
      expect(resolveExpression('lastReceivedData', mockContext)).to.deep.equal(new Uint8Array([0x04, 0x05, 0x06]));
    });

    it('should resolve character code expressions', () => {
      expect(resolveExpression("'A'", mockContext)).to.equal(65);
      expect(resolveExpression("'0'", mockContext)).to.equal(48);
      expect(resolveExpression("'@'", mockContext)).to.equal(64);
      expect(resolveExpression("' '", mockContext)).to.equal(32);
    });

    it('should return unknown expressions unchanged', () => {
      expect(resolveExpression('unknown', mockContext)).to.equal('unknown');
      expect(resolveExpression('custom.variable', mockContext)).to.equal('custom.variable');
      expect(resolveExpression('', mockContext)).to.equal('');
    });

    it('should handle mixed expression types', () => {
      // Test that the function correctly identifies and handles different expression types
      expect(resolveExpression(0x01, mockContext)).to.equal(1); // Number
      expect(resolveExpression('address', mockContext)).to.equal(0x1000); // Context variable
      expect(resolveExpression("'A'", mockContext)).to.equal(65); // Character code
      expect(resolveExpression('unknown', mockContext)).to.equal('unknown'); // Unknown string
    });
  });

  describe('resolveExpressions()', () => {
    it('should resolve array of numbers unchanged', () => {
      const expressions = [0x01, 0x02, 0x03, 0xFF];
      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([1, 2, 3, 255]);
    });

    it('should resolve array of context variables', () => {
      const expressions = ['address', 'segment.chunkSize', 'segment.startAddress'];
      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([16, 0, 64, 4096]); // address: 0x1000 = [16, 0], chunkSize: 64, startAddress: 4096 (not expanded)
    });

    it('should resolve array of character codes', () => {
      const expressions = ["'A'", "'0'", "'@'"];
      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([65, 48, 64]);
    });

    it('should resolve mixed expression types in array', () => {
      const expressions = [0x01, 'address', "'A'", 'unknown', 0xFF];
      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([1, 16, 0, 65, 'unknown', 255]); // address: 0x1000 = [16, 0]
    });

    it('should maintain order of expressions', () => {
      const expressions = ['address', 0x01, "'A'", 'segment.chunkSize'];
      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([16, 0, 1, 65, 64]); // address: 0x1000 = [16, 0]
    });

    it('should handle empty array', () => {
      const result = resolveExpressions([], mockContext);
      expect(result).to.deep.equal([]);
    });

    it('should handle single element array', () => {
      const result = resolveExpressions(['address'], mockContext);
      expect(result).to.deep.equal([16, 0]); // address: 0x1000 = [16, 0]
    });

    it('should handle complex data types in context variables', () => {
      const expressions = ['segment.data', 'lastReceivedData'];
      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([
        Uint8ArrayFactory.build(),
        new Uint8Array([0x04, 0x05, 0x06])
      ]);
    });

    it('should handle all expression types in a single array', () => {
      const expressions = [
        0x01,                    // Number
        'address',               // Context variable
        "'A'",                   // Character code
        'unknown',               // Unknown string
        0xFF,                    // Number
        'segment.chunkSize',     // Context variable
        "'0'",                   // Character code
        'segment.data'           // Complex context variable
      ];

      const result = resolveExpressions(expressions, mockContext);
      expect(result).to.deep.equal([
        1,                       // Resolved number
        16, 0,                   // Resolved address: 0x1000 = [16, 0]
        65,                      // Resolved character code
        'unknown',               // Unchanged unknown string
        255,                     // Resolved number
        64,                      // Resolved chunk size
        48,                      // Resolved character code
        Uint8ArrayFactory.build() // Resolved segment data
      ]);
    });
  });
});
