import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
import { EventEmitter } from "events";
import { extractDataFromResponse, validateReceivePattern, executeSendReceive } from "@src/utils/step-utils.js";
import type { RadioReceivePattern } from "@springfield/ham-radio-api";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory, RadioExactReceivePatternFactory, RadioVariableReceivePatternFactory, RadioPatternReceivePatternFactory, RadioAnyReceivePatternFactory, Uint8ArrayFactory, BufferFactory } from "./test-factories.js";

describe("step-utils", () => {
  let mockContext: ProtocolContext;

  beforeEach(() => {
    mockContext = ProtocolContextFactory.build();
  });

  describe("validateReceivePattern()", () => {
    it("should validate exact pattern correctly", () => {
      const pattern = RadioExactReceivePatternFactory.build();
      const data = BufferFactory.build();

      const isValid = validateReceivePattern(data, pattern);
      expect(isValid).to.be.true;
    });

    it("should reject invalid exact pattern", () => {
      const pattern = RadioExactReceivePatternFactory.build();
      const data = Buffer.from([0x07, 0x01, 0x02, 0x03]);

      const isValid = validateReceivePattern(data, pattern);
      expect(isValid).to.be.false;
    });

    it("should validate variable pattern correctly", () => {
      const pattern = RadioVariableReceivePatternFactory.build();
      const data = Buffer.from([0x01, 0x02, 0x03, 0x04]);

      const isValid = validateReceivePattern(data, pattern);
      expect(isValid).to.be.true;
    });

    it("should reject invalid variable pattern", () => {
      const pattern = RadioVariableReceivePatternFactory.build();
      const data = Buffer.from([0x01, 0x02, 0x03]);

      const isValid = validateReceivePattern(data, pattern);
      expect(isValid).to.be.false;
    });

    it("should validate pattern with correct total length", () => {
      const pattern = RadioPatternReceivePatternFactory.build();

      // The expected total length should be:
      // Header: X(1) + address(2) + length(1) = 4 bytes
      // Data: chunkSize = 64 bytes (from segment config)
      // Total: 4 + 64 = 68 bytes

      const responseData = Buffer.alloc(68); // Correct total length
      responseData[0] = 0x58; // 'X'

      const isValid = validateReceivePattern(responseData, pattern);
      expect(isValid).to.be.true;
    });

    it("should reject pattern with insufficient length", () => {
      const pattern = RadioPatternReceivePatternFactory.build();

      // The expected total length is 14 (header 4 + length field 10)
      // Provide less than 14 bytes to trigger insufficient length
      const responseData = Buffer.alloc(10); // Only 10 bytes, should be insufficient
      responseData[0] = 0x58; // 'X'
      responseData[3] = 10; // Length field: expect 10 bytes of data

      const isValid = validateReceivePattern(responseData, pattern, mockContext);
      expect(isValid).to.be.false;
    });

    it("should validate any pattern correctly", () => {
      const pattern = RadioAnyReceivePatternFactory.build();
      const data = Buffer.alloc(32);

      const isValid = validateReceivePattern(data, pattern);
      expect(isValid).to.be.true;
    });

    it("should reject invalid any pattern", () => {
      const pattern = RadioAnyReceivePatternFactory.build();
      const data = Buffer.alloc(16); // Wrong length

      const isValid = validateReceivePattern(data, pattern);
      expect(isValid).to.be.false;
    });
  });

  describe("extractDataFromResponse()", () => {
    it("should extract data correctly from exact pattern response", () => {
      const responseData = Uint8ArrayFactory.build();
      const pattern = RadioExactReceivePatternFactory.build();

      const extractedData = extractDataFromResponse(responseData, pattern);
      expect(extractedData).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should extract data correctly from variable pattern response", () => {
      const responseData = Uint8ArrayFactory.build();
      const pattern = RadioVariableReceivePatternFactory.build();

      const extractedData = extractDataFromResponse(responseData, pattern);
      expect(extractedData).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should extract data correctly from pattern response", () => {
      // Simulate Baofeng UV-5R response: [X, address_high, address_low, length, data...]
      const responseData = new Uint8Array([0x58, 0x00, 0x10, 0x40, 0x01, 0x02, 0x03, 0x04]);

      const pattern = RadioPatternReceivePatternFactory.build();

      const extractedData = extractDataFromResponse(responseData, pattern);

      // Should skip 4 bytes (X + address + length) and return the data portion
      expect(extractedData).to.deep.equal(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
    });

    it("should extract data correctly from any pattern response", () => {
      const responseData = Uint8ArrayFactory.build();
      const pattern = RadioAnyReceivePatternFactory.build();

      const extractedData = extractDataFromResponse(responseData, pattern);
      expect(extractedData).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should handle empty data extraction", () => {
      const responseData = Uint8ArrayFactory.build();
      const pattern: RadioReceivePattern = {
        type: "pattern",
        pattern: [0x06, { field: "data", size: 3 }],
      };

      const extractedData = extractDataFromResponse(responseData, pattern);
      expect(extractedData).to.deep.equal(new Uint8Array(0));
    });
  });

  describe("executeSendReceive()", () => {
    it("should execute send-receive operation successfully", async () => {
      const config = {
        send: [0x01, 0x02, 0x03],
        receive: RadioExactReceivePatternFactory.build(),
        timeout: 1000,
        description: "Test operation",
      };

      // Mock the port to simulate a successful response
      (mockContext.port as any) = {
        write: () => {},
        pipe: () => {
          const parser = new EventEmitter();
          setTimeout(() => {
            parser.emit("data", BufferFactory.build());
          }, 10);
          return parser;
        },
      };

      const result = await executeSendReceive(config, mockContext);
      expect(result).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should handle operation without description", async () => {
      const config = {
        send: [0x01, 0x02, 0x03],
        receive: RadioExactReceivePatternFactory.build(),
        timeout: 1000,
      };

      // Mock the port to simulate a successful response
      (mockContext.port as any) = {
        write: () => {},
        pipe: () => {
          const parser = new EventEmitter();
          setTimeout(() => {
            parser.emit("data", BufferFactory.build());
          }, 10);
          return parser;
        },
      };

      const result = await executeSendReceive(config, mockContext);
      expect(result).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should handle operation with default timeout", async () => {
      const config = {
        send: [0x01, 0x02, 0x03],
        receive: RadioExactReceivePatternFactory.build(),
      };

      // Mock the port to simulate a successful response
      (mockContext.port as any) = {
        write: () => {},
        pipe: () => {
          const parser = new EventEmitter();
          setTimeout(() => {
            parser.emit("data", BufferFactory.build());
          }, 10);
          return parser;
        },
      };

      const result = await executeSendReceive(config, mockContext);
      expect(result).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should handle operation with expressions in send data", async () => {
      const config = {
        send: [0x01, "address", "'A'"],
        receive: RadioExactReceivePatternFactory.build(),
        timeout: 1000,
      };

      // Mock the port to simulate a successful response
      (mockContext.port as any) = {
        write: () => {},
        pipe: () => {
          const parser = new EventEmitter();
          setTimeout(() => {
            parser.emit("data", BufferFactory.build());
          }, 10);
          return parser;
        },
      };

      const result = await executeSendReceive(config, mockContext);
      expect(result).to.deep.equal(Uint8ArrayFactory.build());
    });

    it("should throw error for invalid response pattern", async () => {
      const config = {
        send: [0x01, 0x02, 0x03],
        receive: RadioExactReceivePatternFactory.build(),
        timeout: 1000,
      };

      // Mock the port to simulate an invalid response
      (mockContext.port as any) = {
        write: () => {},
        pipe: () => {
          const parser = new EventEmitter();
          setTimeout(() => {
            parser.emit("data", Buffer.from([0x07, 0x01, 0x02, 0x03])); // Wrong first byte
          }, 10);
          return parser;
        },
      };

      try {
        await executeSendReceive(config, mockContext);
        expect.fail("Should have thrown error for invalid response pattern");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include("Invalid response pattern");
      }
    });

    it("should throw error for timeout", async () => {
      const config = {
        send: [0x01, 0x02, 0x03],
        receive: RadioExactReceivePatternFactory.build(),
        timeout: 50, // Short timeout
      };

      // Mock the port to not emit any data (causing timeout)
      (mockContext.port as any) = {
        write: () => {},
        pipe: () => new EventEmitter(), // No data emission
      };

      try {
        await executeSendReceive(config, mockContext);
        expect.fail("Should have thrown timeout error");
      } catch (error) {
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.include("Timeout waiting for response");
      }
    });
  });
});
