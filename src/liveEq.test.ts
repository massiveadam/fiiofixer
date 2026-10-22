import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveEqWriter } from './liveEq';

afterEach(() => vi.useRealTimers());
const raw = (value: number): Uint8Array => new Uint8Array([value]);

describe('live EQ scheduling', () => {
  it('coalesces continuous edits without waiting for dragging to stop', async () => {
    vi.useFakeTimers();
    const send = vi.fn(async (_before: Uint8Array, target: Uint8Array) => target);
    const writer = new LiveEqWriter(raw(0), send, vi.fn(), vi.fn(), vi.fn());
    writer.submit(raw(1));
    await vi.advanceTimersByTimeAsync(70); writer.submit(raw(2));
    await vi.advanceTimersByTimeAsync(70); writer.submit(raw(3));
    await vi.advanceTimersByTimeAsync(10);
    expect(send).toHaveBeenCalledExactlyOnceWith(raw(0), raw(3));
    writer.submit(raw(4)); await vi.advanceTimersByTimeAsync(150);
    expect(send).toHaveBeenLastCalledWith(raw(3), raw(4));
    await writer.stop();
  });

  it('sends the newest pending target only after the current reply, using its new baseline', async () => {
    vi.useFakeTimers();
    let complete: ((value: Uint8Array) => void) | undefined;
    const send = vi.fn((_before: Uint8Array, _target: Uint8Array) => new Promise<Uint8Array>(resolve => { complete = resolve; }));
    const readback = vi.fn();
    const writer = new LiveEqWriter(raw(0), send, readback, vi.fn(), vi.fn());
    writer.submit(raw(1)); await vi.advanceTimersByTimeAsync(150);
    writer.submit(raw(2)); writer.submit(raw(3));
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    complete?.(raw(1)); await vi.advanceTimersByTimeAsync(150);
    expect(readback).toHaveBeenCalledWith(raw(1), false);
    expect(send).toHaveBeenLastCalledWith(raw(1), raw(3));
    complete?.(raw(3)); await vi.advanceTimersByTimeAsync(0);
    expect(readback).toHaveBeenLastCalledWith(raw(3), true);
    await writer.stop();
  });

  it('discards queued edits on stop and waits for the already-sent write', async () => {
    vi.useFakeTimers();
    let complete: ((value: Uint8Array) => void) | undefined;
    const send = vi.fn((_before: Uint8Array, _target: Uint8Array) => new Promise<Uint8Array>(resolve => { complete = resolve; }));
    const writer = new LiveEqWriter(raw(0), send, vi.fn(), vi.fn(), vi.fn());
    writer.submit(raw(1)); await vi.advanceTimersByTimeAsync(150);
    writer.submit(raw(2));
    let stopped = false;
    const stop = writer.stop().then(() => { stopped = true; });
    await vi.advanceTimersByTimeAsync(500); expect(stopped).toBe(false);
    complete?.(raw(1)); await stop;
    writer.submit(raw(3)); await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never retries after a write failure or mismatching readback', async () => {
    vi.useFakeTimers();
    const failed = vi.fn();
    const send = vi.fn(async () => raw(9));
    const writer = new LiveEqWriter(raw(0), send, vi.fn(), failed, vi.fn());
    writer.submit(raw(1)); await vi.advanceTimersByTimeAsync(150);
    expect(failed).toHaveBeenCalledOnce();
    writer.submit(raw(2)); await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledOnce();
  });

  it('skips targets identical to the last verified state', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const writer = new LiveEqWriter(raw(0), send, vi.fn(), vi.fn(), vi.fn());
    writer.submit(raw(0)); await vi.advanceTimersByTimeAsync(150);
    expect(send).not.toHaveBeenCalled();
    await writer.stop();
  });
});
