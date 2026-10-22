import type { ProtocolContext } from "../protocol-context.js";
import { CleanupBudgetExceededError } from "./cleanup-budget-error.js";

type FixedLengthRead = {
  targetLength: number;
  chunks: Uint8Array[];
  accumulated: number;
  handleData: (data: Buffer) => void;
};

export type PortReceiveState = {
  residue: Uint8Array;
  fixedRead: FixedLengthRead | null;
  tapInstalled: boolean;
  tapPort?: ProtocolContext["port"];
};

const appendToBuffer = (left: Uint8Array, right: Uint8Array): Uint8Array => {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
};

const concatChunks = (chunks: Uint8Array[], totalLength: number): Uint8Array => {
  const out = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
};

const asDataListenerTarget = (port: ProtocolContext["port"]): {
  on: (event: string, listener: (data: Buffer) => void) => void;
} => {
  const candidate = port as unknown as {
    on?: (event: string, listener: (data: Buffer) => void) => void;
    addListener?: (event: string, listener: (data: Buffer) => void) => void;
  };

  const on = candidate.on ?? candidate.addListener;

  if (on === undefined) {
    throw new Error("Serial port does not support data event listeners");
  }

  return { on };
};

export const getPortReceiveState = (context: ProtocolContext): PortReceiveState => {
  if (context.portReceiveState === undefined) {
    context.portReceiveState = {
      fixedRead: null,
      residue: new Uint8Array(0),
      tapInstalled: false,
    };
  }

  return context.portReceiveState;
};

const dispatchPortData = (context: ProtocolContext, data: Buffer): void => {
  const state = getPortReceiveState(context);
  const incoming = new Uint8Array(data);

  if (state.fixedRead !== null) {
    state.fixedRead.handleData(data);
    return;
  }

  state.residue = appendToBuffer(state.residue, incoming);
};

export const ensurePortReceiveTap = (context: ProtocolContext): void => {
  const state = getPortReceiveState(context);

  if (state.tapInstalled && state.tapPort === context.port) {
    return;
  }

  const { on } = asDataListenerTarget(context.port);
  on.call(context.port, "data", (data: Buffer) => {
    dispatchPortData(context, data);
  });
  state.tapInstalled = true;
  state.tapPort = context.port;
};

export const residueStartsWith = (context: ProtocolContext, byte: number): boolean => {
  const state = getPortReceiveState(context);
  return state.residue.length > 0 && state.residue[0] === byte;
};

export const consumeResidueBytes = (context: ProtocolContext, count: number): void => {
  const state = getPortReceiveState(context);

  if (count <= 0) {
    return;
  }

  state.residue = state.residue.subarray(Math.min(count, state.residue.length));
};

const takeFromResidue = (state: PortReceiveState, count: number): Uint8Array => {
  if (count <= 0) {
    return new Uint8Array(0);
  }

  const taken = state.residue.subarray(0, Math.min(count, state.residue.length));
  state.residue = state.residue.subarray(taken.length);
  return new Uint8Array(taken);
};

const returnPartialToResidue = (state: PortReceiveState): void => {
  if (state.fixedRead === null || state.fixedRead.accumulated === 0) {
    return;
  }

  const partial = concatChunks(state.fixedRead.chunks, state.fixedRead.accumulated);
  state.residue = appendToBuffer(state.residue, partial);
};

type FixedLengthReadHandle = {
  promise: Promise<Buffer>;
  cancel: (error?: Error) => void;
  release: () => void;
};

export const readFixedLengthWithResidue = (
  context: ProtocolContext,
  length: number,
  timeoutMs: number,
  description: string | undefined,
  deadlineAt: number | undefined,
): FixedLengthReadHandle => {
  ensurePortReceiveTap(context);
  const state = getPortReceiveState(context);

  if (state.fixedRead !== null) {
    throw new Error("Concurrent fixed-length reads are not supported");
  }

  let settled = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let rejectRead: (error: Error) => void = () => undefined;
  let resolveRead: (value: Buffer) => void = () => undefined;

  const detach = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const finishFixedRead = (): void => {
    if (state.fixedRead !== null) {
      state.fixedRead = null;
    }
  };

  const fail = (error: Error): void => {
    if (settled) {
      return;
    }

    settled = true;
    detach();
    returnPartialToResidue(state);
    finishFixedRead();
    rejectRead(error);
  };

  const succeed = (frame: Uint8Array): void => {
    if (settled) {
      return;
    }

    settled = true;
    detach();
    finishFixedRead();
    resolveRead(Buffer.from(frame));
  };

  const tryComplete = (): void => {
    if (state.fixedRead === null) {
      return;
    }

    const active = state.fixedRead;

    if (active.accumulated < length) {
      return;
    }

    const combined = concatChunks(active.chunks, active.accumulated);
    const frame = combined.subarray(0, length);
    const surplus = combined.subarray(length);

    if (surplus.length > 0) {
      state.residue = appendToBuffer(state.residue, surplus);
    }

    succeed(frame);
  };

  const handleData = (data: Buffer): void => {
    if (settled || state.fixedRead === null) {
      return;
    }

    const incoming = new Uint8Array(data);
    state.fixedRead.chunks.push(incoming);
    state.fixedRead.accumulated += incoming.length;
    tryComplete();
  };

  const initial = takeFromResidue(state, length);
  state.fixedRead = {
    accumulated: initial.length,
    chunks: initial.length > 0 ? [initial] : [],
    handleData,
    targetLength: length,
  };

  const promise = new Promise<Buffer>((resolve, reject) => {
    resolveRead = resolve;
    rejectRead = reject;

    timeoutId = setTimeout(() => {
      if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
        fail(new CleanupBudgetExceededError());
        return;
      }

      fail(new Error(`Timeout waiting for response: ${description || "operation"}`));
    }, timeoutMs);

    tryComplete();
  });

  const release = (): void => {
    if (settled) {
      return;
    }

    settled = true;
    detach();
    returnPartialToResidue(state);
    finishFixedRead();
  };

  return {
    cancel: (error?: Error) => {
      if (settled) {
        return;
      }

      fail(error ?? new Error("Read cancelled"));
    },
    promise,
    release,
  };
};
