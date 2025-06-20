import { describe, it, beforeEach } from "node:test";
import { expect } from "chai";
import { ContextVariableResolver, CharacterCodeResolver, DefaultResolver, VariablesMapResolver, ExpressionResolverFactory } from "@src/utils/expression-resolvers.js";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory, Uint8ArrayFactory } from "./test-factories.js";

describe("expression-resolvers", () => {
  describe("ContextVariableResolver", () => {
    let resolver: ContextVariableResolver;
    let mockContext: ProtocolContext;

    beforeEach(() => {
      resolver = new ContextVariableResolver();
      mockContext = ProtocolContextFactory.build({
        variables: new Map([
          ["segment.data", Uint8ArrayFactory.build()],
          ["lastReceivedData", new Uint8Array([0x04, 0x05, 0x06])],
        ]),
      });
    });

    describe("canResolve()", () => {
      it("should return true for known context variables", () => {
        expect(resolver.canResolve("address")).to.be.true;
        expect(resolver.canResolve("segment.chunkSize")).to.be.true;
        expect(resolver.canResolve("segment.startAddress")).to.be.true;
        expect(resolver.canResolve("segment.endAddress")).to.be.true;
        expect(resolver.canResolve("segment.data")).to.be.true;
        expect(resolver.canResolve("lastReceivedData")).to.be.true;
      });

      it("should return false for unknown variables", () => {
        expect(resolver.canResolve("unknown")).to.be.false;
        expect(resolver.canResolve("segment.unknown")).to.be.false;
      });

      it("should return false for non-string expressions", () => {
        expect(resolver.canResolve(123)).to.be.false;
        expect(resolver.canResolve(0x01)).to.be.false;
      });
    });

    describe("resolve()", () => {
      it("should resolve address to current segment address", () => {
        const result = resolver.resolve("address", mockContext);
        expect(result).to.equal(0x1000);
      });

      it("should resolve segment.chunkSize to memory config chunk size", () => {
        const result = resolver.resolve("segment.chunkSize", mockContext);
        expect(result).to.equal(64);
      });

      it("should resolve segment.startAddress to segment config start address", () => {
        const result = resolver.resolve("segment.startAddress", mockContext);
        expect(result).to.equal(0x1000);
      });

      it("should resolve segment.endAddress to segment config end address", () => {
        const result = resolver.resolve("segment.endAddress", mockContext);
        expect(result).to.equal(0x2000);
      });

      it("should resolve segment.data to stored segment data", () => {
        const result = resolver.resolve("segment.data", mockContext);
        expect(result).to.deep.equal(Uint8ArrayFactory.build());
      });

      it("should resolve lastReceivedData to stored received data", () => {
        const result = resolver.resolve("lastReceivedData", mockContext);
        expect(result).to.deep.equal(new Uint8Array([0x04, 0x05, 0x06]));
      });

      it("should return default values when context is missing", () => {
        const emptyContext: ProtocolContext = {
          currentSegment: undefined,
          memoryConfig: {
            chunkSize: 0,
            segments: {},
          },
          variables: new Map(),
          port: {} as any,
          logger: {} as any,
          progressIndicator: {} as any,
          memoryBuffer: new Uint8Array(0),
          bufferOffset: 0,
        };

        expect(resolver.resolve("address", emptyContext)).to.equal(0);
        expect(resolver.resolve("segment.chunkSize", emptyContext)).to.equal(0);
        expect(resolver.resolve("segment.startAddress", emptyContext)).to.equal(0);
        expect(resolver.resolve("segment.endAddress", emptyContext)).to.equal(0);
        expect(resolver.resolve("segment.data", emptyContext)).to.deep.equal(new Uint8Array(0));
        expect(resolver.resolve("lastReceivedData", emptyContext)).to.deep.equal(new Uint8Array(0));
      });

      it("should return undefined for unknown variables", () => {
        const result = resolver.resolve("unknown", mockContext);
        expect(result).to.equal(undefined);
      });
    });
  });

  describe("CharacterCodeResolver", () => {
    let resolver: CharacterCodeResolver;

    beforeEach(() => {
      resolver = new CharacterCodeResolver();
    });

    describe("canResolve()", () => {
      it("should return true for character code expressions", () => {
        expect(resolver.canResolve("'A'")).to.be.true;
        expect(resolver.canResolve("'0'")).to.be.true;
        expect(resolver.canResolve("'@'")).to.be.true;
        expect(resolver.canResolve("' '")).to.be.true;
      });

      it("should return false for non-character code expressions", () => {
        expect(resolver.canResolve("A")).to.be.false;
        expect(resolver.canResolve("'A")).to.be.false;
        expect(resolver.canResolve("A'")).to.be.false;
        expect(resolver.canResolve(65)).to.be.false;
        expect(resolver.canResolve("address")).to.be.false;
      });
    });

    describe("resolve()", () => {
      it("should resolve character codes to ASCII values", () => {
        expect(resolver.resolve("'A'")).to.equal(65);
        expect(resolver.resolve("'0'")).to.equal(48);
        expect(resolver.resolve("'@'")).to.equal(64);
        expect(resolver.resolve("' '")).to.equal(32);
        expect(resolver.resolve("'a'")).to.equal(97);
      });

      it("should handle special characters", () => {
        expect(resolver.resolve("'\n'")).to.equal(10);
        expect(resolver.resolve("'\r'")).to.equal(13);
        expect(resolver.resolve("'\t'")).to.equal(9);
      });
    });
  });

  describe("DefaultResolver", () => {
    let resolver: DefaultResolver;

    beforeEach(() => {
      resolver = new DefaultResolver();
    });

    describe("canResolve()", () => {
      it("should always return true", () => {
        expect(resolver.canResolve()).to.be.true;
      });
    });

    describe("resolve()", () => {
      it("should return expression unchanged", () => {
        expect(resolver.resolve("anything")).to.equal("anything");
        expect(resolver.resolve(123)).to.equal(123);
        expect(resolver.resolve("'A'")).to.equal("'A'");
        expect(resolver.resolve("")).to.equal("");
      });
    });
  });

  describe("VariablesMapResolver", () => {
    let resolver: VariablesMapResolver;
    let mockContext: ProtocolContext;

    beforeEach(() => {
      resolver = new VariablesMapResolver();
      mockContext = ProtocolContextFactory.build({
        variables: new Map<string, any>([
          ["customVar", "test"],
          ["numberVar", 42],
          ["segment.data", Uint8ArrayFactory.build()],
        ]),
      });
    });

    describe("canResolve()", () => {
      it("should return true for string expressions", () => {
        expect(resolver.canResolve("customVar")).to.be.true;
        expect(resolver.canResolve("numberVar")).to.be.true;
        expect(resolver.canResolve("")).to.be.true;
      });

      it("should return false for non-string expressions", () => {
        expect(resolver.canResolve(123)).to.be.false;
        expect(resolver.canResolve(0x01)).to.be.false;
      });
    });

    describe("resolve()", () => {
      it("should resolve variables from context variables map (direct call)", () => {
        expect(resolver.resolve("customVar", mockContext)).to.equal("test");
        expect(resolver.resolve("numberVar", mockContext)).to.equal(42);
      });

      it("should return expression unchanged when variable not found", () => {
        expect(resolver.resolve("unknown", mockContext)).to.equal("unknown");
        expect(resolver.resolve("missing", mockContext)).to.equal("missing");
      });

      it("should handle empty variables map", () => {
        const emptyContext: ProtocolContext = {
          currentSegment: undefined,
          memoryConfig: {
            chunkSize: 0,
            segments: {},
          },
          variables: new Map(),
          port: {} as any,
          logger: {} as any,
          progressIndicator: {} as any,
          memoryBuffer: new Uint8Array(0),
          bufferOffset: 0,
        };

        expect(resolver.resolve("anyVar", emptyContext)).to.equal("anyVar");
      });
    });
  });

  describe("ExpressionResolverFactory", () => {
    let mockContext: ProtocolContext;

    beforeEach(() => {
      mockContext = ProtocolContextFactory.build({
        variables: new Map<string, any>([
          ["customVar", "test"],
          ["numberVar", 42],
          ["segment.data", Uint8ArrayFactory.build()],
        ]),
      });
    });

    describe("resolve()", () => {
      it("should resolve context variables using ContextVariableResolver", () => {
        expect(ExpressionResolverFactory.resolve("address", mockContext)).to.equal(0x1000);
        expect(ExpressionResolverFactory.resolve("segment.chunkSize", mockContext)).to.equal(64);
        expect(ExpressionResolverFactory.resolve("segment.data", mockContext)).to.deep.equal(Uint8ArrayFactory.build());
      });

      it("should resolve character codes using CharacterCodeResolver", () => {
        expect(ExpressionResolverFactory.resolve("'A'", mockContext)).to.equal(65);
        expect(ExpressionResolverFactory.resolve("'0'", mockContext)).to.equal(48);
      });

      it("should resolve numbers unchanged", () => {
        expect(ExpressionResolverFactory.resolve(123, mockContext)).to.equal(123);
        expect(ExpressionResolverFactory.resolve(0x01, mockContext)).to.equal(1);
      });

      it("should resolve unknown expressions using DefaultResolver", () => {
        expect(ExpressionResolverFactory.resolve("unknown", mockContext)).to.equal("unknown");
        expect(ExpressionResolverFactory.resolve("custom.variable", mockContext)).to.equal("custom.variable");
      });

      it("should resolve variables from variables map using VariablesMapResolver", () => {
        expect(ExpressionResolverFactory.resolve("customVar", mockContext)).to.equal("test");
        expect(ExpressionResolverFactory.resolve("numberVar", mockContext)).to.equal(42);
      });

      it("should throw error if no resolver is found (should not happen with DefaultResolver)", () => {
        // This test is mainly for documentation purposes since DefaultResolver should always handle everything
        // In a real scenario, this would only happen if DefaultResolver was removed from the factory
        expect(() => {
          // This should not throw due to DefaultResolver
          ExpressionResolverFactory.resolve("any expression", mockContext);
        }).to.not.throw();
      });

      it("should handle resolver precedence correctly", () => {
        // ContextVariableResolver should take precedence over DefaultResolver for known variables
        expect(ExpressionResolverFactory.resolve("address", mockContext)).to.equal(0x1000);

        // CharacterCodeResolver should take precedence over DefaultResolver for character codes
        expect(ExpressionResolverFactory.resolve("'A'", mockContext)).to.equal(65);

        // DefaultResolver should handle everything else
        expect(ExpressionResolverFactory.resolve("unknown", mockContext)).to.equal("unknown");
      });

      it("should resolve context variables", () => {
        const context = {
          variables: new Map<string, any>([
            ["segment.data", "test-data"],
            ["lastReceivedData", "received-data"],
          ]),
        } as any;
        const expression = "segment.data";

        const result = ExpressionResolverFactory.resolve(expression, context);

        expect(result).to.equal("test-data");
      });
    });
  });
});
