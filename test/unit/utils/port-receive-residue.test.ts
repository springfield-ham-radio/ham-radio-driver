import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SendReceiveOperation } from "@src/utils/protocol-operations.js";
import { ensurePortReceiveTap, getPortReceiveState, readFixedLengthWithResidue } from "@src/utils/port-receive-residue.js";
import type { ProtocolContext } from "@src/protocol-context.js";
import { ProtocolContextFactory } from "./test-factories.js";

describe("port-receive-residue", () => {
  let mockPort: EventEmitter;
  let mockContext: ProtocolContext;

  beforeEach(() => {
    mockPort = new EventEmitter();
    mockContext = ProtocolContextFactory.build({
      port: mockPort as never,
    });
    (mockContext.port as { write: (data: Uint8Array) => boolean }).write = () => true;
  });

  afterEach(() => {
    mockPort.removeAllListeners();
  });

  it("buffers bytes received while no fixed-length read is active", () => {
    ensurePortReceiveTap(mockContext);
    mockPort.emit("data", Buffer.from([0x06]));
    expect(Array.from(getPortReceiveState(mockContext).residue)).toEqual([0x06]);
  });

  it("prepends residue to the next fixed-length read", async () => {
    ensurePortReceiveTap(mockContext);
    mockPort.emit("data", Buffer.from([0x06]));

    const pending = readFixedLengthWithResidue(mockContext, 1, 200, "ack", undefined);
    await expect(pending.promise).resolves.toEqual(Buffer.from([0x06]));
    expect(getPortReceiveState(mockContext).residue.length).toBe(0);
  });

  it("stores surplus bytes after a completed fixed-length frame", async () => {
    const pending = readFixedLengthWithResidue(mockContext, 1, 200, "ack", undefined);
    mockPort.emit("data", Buffer.from([0x06, 0x57, 0x01]));

    await expect(pending.promise).resolves.toEqual(Buffer.from([0x06]));
    expect(Array.from(getPortReceiveState(mockContext).residue)).toEqual([0x57, 0x01]);
  });

  it("returns partial bytes to residue when a fixed-length read times out", async () => {
    vi.useFakeTimers();

    try {
      const pending = readFixedLengthWithResidue(mockContext, 262, 50, "frame", undefined);
      mockPort.emit("data", Buffer.from([0x57, 0x01]));

      const assertion = expect(pending.promise).rejects.toThrow(/Timeout waiting for response/);
      await vi.advanceTimersByTimeAsync(50);
      await assertion;

      expect(Array.from(getPortReceiveState(mockContext).residue)).toEqual([0x57, 0x01]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes SendReceiveOperation when the ack arrives before the write callback", async () => {
    const operation = new SendReceiveOperation();
    let writeCallback: ((error?: Error | null) => void) | undefined;

    (mockContext.port as { write: (data: Uint8Array, callback?: (error?: Error | null) => void) => boolean }).write = (
      _data,
      callback,
    ) => {
      writeCallback = callback;
      return true;
    };

    const pending = operation.execute({ send: [0x06], expect: "0x06", timeout: 500 }, mockContext);
    mockPort.emit("data", Buffer.from([0x06]));

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    writeCallback?.(null);

    await expect(pending).resolves.toEqual(new Uint8Array([0x06]));
  });
});
