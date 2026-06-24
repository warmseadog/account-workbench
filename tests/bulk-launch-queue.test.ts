import { describe, expect, it } from "vitest";
import { runBulkLaunchQueue } from "../src/renderer/bulk-launch-queue";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("bulk launch queue", () => {
  it("limits concurrent account launches while processing every item", async () => {
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const finished: number[] = [];
    let active = 0;
    let maxActive = 0;

    const runPromise = runBulkLaunchQueue(
      [0, 1, 2, 3],
      async (item) => {
        started.push(item);
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gates[item].promise;
        active -= 1;
        finished.push(item);
      },
      { concurrency: 2, staggerMs: 0 }
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(maxActive).toBe(2);

    gates[0].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toContain(2);
    expect(maxActive).toBe(2);

    gates[1].resolve();
    gates[2].resolve();
    gates[3].resolve();
    await runPromise;

    expect(finished.sort()).toEqual([0, 1, 2, 3]);
    expect(maxActive).toBe(2);
  });
});
