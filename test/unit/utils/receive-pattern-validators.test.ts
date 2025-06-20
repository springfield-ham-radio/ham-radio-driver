import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
import { ExactReceivePatternValidator, VariableReceivePatternValidator, PatternReceivePatternValidator, AnyReceivePatternValidator } from "@src/utils/receive-pattern-validators.js";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory, RadioExactReceivePatternFactory, RadioVariableReceivePatternFactory, RadioPatternReceivePatternFactory, RadioAnyReceivePatternFactory, Uint8ArrayFactory, BufferFactory } from "./test-factories.js";

describe("receive-pattern-validators", () => {
  let mockContext: ProtocolContext;

  beforeEach(() => {
    mockContext = ProtocolContextFactory.build({
      variables: new Map([["dataLength", 32]]),
    });
  });

  describe("ExactReceivePatternValidator", () => {
    let validator: ExactReceivePatternValidator;

    beforeEach(() => {
      validator = new ExactReceivePatternValidator();
    });

    describe("canValidate()", () => {
      it("should return true for exact pattern type", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        expect(validator.canValidate(pattern)).to.be.true;
      });

      it("should return false for other pattern types", () => {
        expect(validator.canValidate(RadioVariableReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioPatternReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioAnyReceivePatternFactory.build())).to.be.false;
      });
    });

    describe("validate()", () => {
      it("should return true when first byte matches expected value", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = BufferFactory.build();
        expect(validator.validate(data, pattern)).to.be.true;
      });

      it("should return false when first byte does not match", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = Buffer.from([0x07, 0x01, 0x02, 0x03]);
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should return false for non-exact pattern types", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const data = BufferFactory.build();
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should handle single byte data", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = Buffer.from([0x06]);
        expect(validator.validate(data, pattern)).to.be.true;
      });
    });

    describe("extractData()", () => {
      it("should return complete data for exact matches", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = Uint8ArrayFactory.build();
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });

      it("should handle single byte data", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = new Uint8Array([0x06]);
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(new Uint8Array([0x06]));
      });
    });

    describe("getExpectedLength()", () => {
      it("should always return 1 for exact patterns", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        expect(validator.getExpectedLength(pattern)).to.equal(1);
      });
    });
  });

  describe("VariableReceivePatternValidator", () => {
    let validator: VariableReceivePatternValidator;

    beforeEach(() => {
      validator = new VariableReceivePatternValidator();
    });

    describe("canValidate()", () => {
      it("should return true for variable pattern type", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        expect(validator.canValidate(pattern)).to.be.true;
      });

      it("should return false for other pattern types", () => {
        expect(validator.canValidate(RadioExactReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioPatternReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioAnyReceivePatternFactory.build())).to.be.false;
      });
    });

    describe("validate()", () => {
      it("should return true when data length matches expected length", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        expect(validator.validate(data, pattern)).to.be.true;
      });

      it("should return false when data length does not match", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const data = Buffer.from([0x01, 0x02, 0x03]);
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should return false for non-variable pattern types", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should handle zero length data", () => {
        const pattern = RadioVariableReceivePatternFactory.build({ length: 0 });
        const data = Buffer.alloc(0);
        expect(validator.validate(data, pattern)).to.be.true;
      });
    });

    describe("extractData()", () => {
      it("should return complete data for variable patterns", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const data = Uint8ArrayFactory.build();
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });
    });

    describe("getExpectedLength()", () => {
      it("should return the specified length for variable patterns", () => {
        const pattern = RadioVariableReceivePatternFactory.build({ length: 64 });
        expect(validator.getExpectedLength(pattern)).to.equal(64);
      });

      it("should return 1 for non-variable patterns", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        expect(validator.getExpectedLength(pattern)).to.equal(1);
      });
    });
  });

  describe("PatternReceivePatternValidator", () => {
    let validator: PatternReceivePatternValidator;

    beforeEach(() => {
      validator = new PatternReceivePatternValidator();
    });

    describe("canValidate()", () => {
      it("should return true for pattern type", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        expect(validator.canValidate(pattern)).to.be.true;
      });

      it("should return false for other pattern types", () => {
        expect(validator.canValidate(RadioExactReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioVariableReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioAnyReceivePatternFactory.build())).to.be.false;
      });
    });

    describe("validate()", () => {
      it("should return true when data length is sufficient for pattern header", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
        });
        const data = Buffer.from([0x06, 0x01, 0x02, 0x03, 0x04]);
        expect(validator.validate(data, pattern)).to.be.true;
      });

      it("should return false when data length is insufficient", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
        });
        const data = Buffer.from([0x06, 0x01, 0x02]); // Only 3 bytes, need 4
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should return false for non-pattern types", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = Buffer.from([0x06, 0x01, 0x02, 0x03]);
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should handle complex pattern headers", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        const data = Buffer.alloc(68); // 4 bytes header + 64 bytes data
        data[0] = 0x58; // 'X'
        expect(validator.validate(data, pattern)).to.be.true;
      });
    });

    describe("extractData()", () => {
      it("should extract data after pattern header", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
        });
        const data = new Uint8Array([0x06, 0x01, 0x02, 0x03, 0x04, 0x05]);
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(new Uint8Array([0x04, 0x05]));
      });

      it("should handle complex pattern headers", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        const data = new Uint8Array([0x58, 0x00, 0x10, 0x40, 0x01, 0x02, 0x03, 0x04]);
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
      });

      it("should return empty array when no data after header", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
        });
        const data = new Uint8Array([0x06, 0x01, 0x02, 0x03]);
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(new Uint8Array(0));
      });
    });

    describe("getExpectedLength()", () => {
      it("should return header length when no context or dataLength", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
        });
        expect(validator.getExpectedLength(pattern)).to.equal(4);
      });

      it("should return header length plus chunk size when context has currentSegment", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
        });
        expect(validator.getExpectedLength(pattern, mockContext)).to.equal(4 + 64);
      });

      it("should return header length plus resolved dataLength", () => {
        const pattern = RadioPatternReceivePatternFactory.build({
          pattern: [0x06, { field: "data", size: 3 }],
          dataLength: "dataLength",
        });

        // Create context without currentSegment to test dataLength resolution
        const contextWithoutSegment = {
          ...mockContext,
          currentSegment: undefined,
        };

        expect(validator.getExpectedLength(pattern, contextWithoutSegment)).to.equal(4 + 32);
      });

      it("should return header length for non-pattern types", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        expect(validator.getExpectedLength(pattern)).to.equal(1);
      });

      it("should handle complex pattern headers", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        expect(validator.getExpectedLength(pattern, mockContext)).to.equal(4 + 64);
      });
    });
  });

  describe("AnyReceivePatternValidator", () => {
    let validator: AnyReceivePatternValidator;

    beforeEach(() => {
      validator = new AnyReceivePatternValidator();
    });

    describe("canValidate()", () => {
      it("should return true for any pattern type", () => {
        const pattern = RadioAnyReceivePatternFactory.build();
        expect(validator.canValidate(pattern)).to.be.true;
      });

      it("should return false for other pattern types", () => {
        expect(validator.canValidate(RadioExactReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioVariableReceivePatternFactory.build())).to.be.false;
        expect(validator.canValidate(RadioPatternReceivePatternFactory.build())).to.be.false;
      });
    });

    describe("validate()", () => {
      it("should return true when data length matches expected length", () => {
        const pattern = RadioAnyReceivePatternFactory.build({ length: 4 });
        const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        expect(validator.validate(data, pattern)).to.be.true;
      });

      it("should return false when data length does not match", () => {
        const pattern = RadioAnyReceivePatternFactory.build({ length: 4 });
        const data = Buffer.from([0x01, 0x02, 0x03]);
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should return false for non-any pattern types", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);
        expect(validator.validate(data, pattern)).to.be.false;
      });

      it("should handle zero length data", () => {
        const pattern = RadioAnyReceivePatternFactory.build({ length: 0 });
        const data = Buffer.alloc(0);
        expect(validator.validate(data, pattern)).to.be.true;
      });
    });

    describe("extractData()", () => {
      it("should return complete data for any patterns", () => {
        const pattern = RadioAnyReceivePatternFactory.build({ length: 4 });
        const data = Uint8ArrayFactory.build();
        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });
    });

    describe("getExpectedLength()", () => {
      it("should return the specified length for any patterns", () => {
        const pattern = RadioAnyReceivePatternFactory.build();
        expect(validator.getExpectedLength(pattern)).to.equal(32);
      });

      it("should return 1 for non-any patterns", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        expect(validator.getExpectedLength(pattern)).to.equal(1);
      });
    });
  });
});
