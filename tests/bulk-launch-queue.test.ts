import { describe, expect, it } from "vitest";
import {
  BULK_LAUNCH_CONCURRENCY,
  BULK_LAUNCH_STAGGER_MS,
  runBulkLaunchQueue
} from "../src/renderer/bulk-launch-queue";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushAsyncWork(turns = 5): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
  }
}

describe("bulk launch queue", () => {
  it("uses the operator batch defaults of five active launches and 0.5s stagger", () => {
    expect(BULK_LAUNCH_CONCURRENCY).toBe(5);
    expect(BULK_LAUNCH_STAGGER_MS).toBe(500);
  });

  it("limits concurrent account launches while processing every item", async () => {
    const gates = Array.from({ length: 10 }, () => deferred());
    const started: number[] = [];
    const finished: number[] = [];
    let active = 0;
    let maxActive = 0;

    const runPromise = runBulkLaunchQueue(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      async (item) => {
        started.push(item);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gates[item].promise;
        active -= 1;
        finished.push(item);
      },
      { staggerMs: 0 }
    );

    await flushAsyncWork();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(maxActive).toBe(5);

    gates[0].resolve();
    await flushAsyncWork();
    expect(started).toContain(5);
    expect(maxActive).toBe(5);

    gates.forEach((gate) => gate.resolve());
    await runPromise;

    expect(finished.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxActive).toBe(5);
  });

  it("serializes launch starts with the configured stagger interval", async () => {
    const waitCalls: number[] = [];
    const waitReleases: Array<() => void> = [];
    const started: number[] = [];

    const runPromise = runBulkLaunchQueue(
      [0, 1, 2, 3, 4, 5],
      async (item) => {
        started.push(item);
      },
      {
        concurrency: 5,
        staggerMs: 500,
        wait: async (ms) =>
          new Promise<void>((resolve) => {
            waitCalls.push(ms);
            waitReleases.push(resolve);
          })
      }
    );

    await flushAsyncWork();
    expect(started).toEqual([0]);
    expect(waitCalls).toEqual([500]);

    for (let expectedStarted = 2; expectedStarted <= 6; expectedStarted += 1) {
      waitReleases.shift()?.();
      await flushAsyncWork();
      expect(started).toEqual(Array.from({ length: expectedStarted }, (_, index) => index));
      if (expectedStarted < 6) {
        expect(waitCalls).toHaveLength(expectedStarted);
      }
    }

    await runPromise;
    expect(waitCalls).toEqual([500, 500, 500, 500, 500]);
  });
});
