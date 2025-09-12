import { describe, it } from "node:test";
import { expect } from "chai";
import { ReceivePatternValidatorFactory } from "@src/utils/validator-factory.js";
import type { RadioReceivePattern } from "@springfield/ham-radio-api";
import { RadioExactReceivePatternFactory, RadioVariableReceivePatternFactory, RadioPatternReceivePatternFactory, RadioAnyReceivePatternFactory, Uint8ArrayFactory } from "./test-factories.js";

describe("validator-factory", () => {
  describe("ReceivePatternValidatorFactory", () => {
    describe("getValidator()", () => {
      it("should return ExactReceivePatternValidator for exact patterns", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.canValidate(pattern)).to.be.true;
        expect(validator.validate(Buffer.from([0x06]), pattern)).to.be.true;
      });

      it("should return VariableReceivePatternValidator for variable patterns", () => {
        const pattern = RadioVariableReceivePatternFactory.build({ length: 64 });
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.canValidate(pattern)).to.be.true;
        expect(validator.validate(Buffer.alloc(64), pattern)).to.be.true;
      });

      it("should return PatternReceivePatternValidator for pattern patterns", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.canValidate(pattern)).to.be.true;
        expect(validator.validate(Buffer.from([0x58, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]), pattern)).to.be.true;
      });

      it("should return AnyReceivePatternValidator for any patterns", () => {
        const pattern = RadioAnyReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.canValidate(pattern)).to.be.true;
        expect(validator.validate(Buffer.alloc(32), pattern)).to.be.true;
      });

      it("should throw error for unknown pattern types", () => {
        const pattern = { type: "unknown" } as unknown as RadioReceivePattern;

        expect(() => ReceivePatternValidatorFactory.getValidator(pattern)).to.throw("No validator found for pattern type: unknown");
      });

      it("should handle all supported pattern types", () => {
        const patterns: RadioReceivePattern[] = [RadioExactReceivePatternFactory.build(), RadioVariableReceivePatternFactory.build(), RadioPatternReceivePatternFactory.build(), RadioAnyReceivePatternFactory.build()];

        patterns.forEach((pattern) => {
          const validator = ReceivePatternValidatorFactory.getValidator(pattern);
          expect(validator.canValidate(pattern)).to.be.true;
        });
      });

      it("should return consistent validators for same pattern types", () => {
        const pattern1 = RadioExactReceivePatternFactory.build();
        const pattern2 = RadioExactReceivePatternFactory.build({ value: 0x07 });

        const validator1 = ReceivePatternValidatorFactory.getValidator(pattern1);
        const validator2 = ReceivePatternValidatorFactory.getValidator(pattern2);

        expect(validator1.constructor).to.equal(validator2.constructor);
      });

      it("should validate exact pattern correctly", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.validate(Buffer.from([0x06]), pattern)).to.be.true;
        expect(validator.validate(Buffer.from([0x07]), pattern)).to.be.false;
      });

      it("should validate variable pattern correctly", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.validate(Buffer.from([0x01, 0x02, 0x03, 0x04]), pattern)).to.be.true;
        expect(validator.validate(Buffer.from([0x01, 0x02, 0x03]), pattern)).to.be.false;
      });

      it("should validate pattern pattern correctly", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.validate(Buffer.from([0x58, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]), pattern)).to.be.true;
        expect(validator.validate(Buffer.from([0x58, 0x01, 0x02]), pattern)).to.be.false;
      });

      it("should validate any pattern correctly", () => {
        const pattern = RadioAnyReceivePatternFactory.build({ length: 3 });
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.validate(Buffer.from([0x01, 0x02, 0x03]), pattern)).to.be.true;
        expect(validator.validate(Buffer.from([0x01, 0x02]), pattern)).to.be.false;
      });

      it("should extract data correctly for exact patterns", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);
        const data = Uint8ArrayFactory.build();

        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });

      it("should extract data correctly for variable patterns", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);
        const data = Uint8ArrayFactory.build();

        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });

      it("should extract data correctly for pattern patterns", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);
        const data = new Uint8Array([0x06, 0x01, 0x02, 0x03, 0x04, 0x05]);

        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(new Uint8Array([0x04, 0x05]));
      });

      it("should extract data correctly for any patterns", () => {
        const pattern = RadioAnyReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);
        const data = Uint8ArrayFactory.build();

        const result = validator.extractData(data, pattern);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });

      it("should get expected length correctly for exact patterns", () => {
        const pattern = RadioExactReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.getExpectedLength(pattern)).to.equal(1);
      });

      it("should get expected length correctly for variable patterns", () => {
        const pattern = RadioVariableReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.getExpectedLength(pattern)).to.equal(4);
      });

      it("should get expected length correctly for pattern patterns", () => {
        const pattern = RadioPatternReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.getExpectedLength(pattern)).to.equal(4);
      });

      it("should get expected length correctly for any patterns", () => {
        const pattern = RadioAnyReceivePatternFactory.build();
        const validator = ReceivePatternValidatorFactory.getValidator(pattern);

        expect(validator.getExpectedLength(pattern)).to.equal(32);
      });
    });
  });
});
