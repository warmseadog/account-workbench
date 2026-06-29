export const BULK_LAUNCH_CONCURRENCY = 5;
export const BULK_LAUNCH_STAGGER_MS = 500;

export interface BulkLaunchQueueOptions {
  concurrency?: number;
  staggerMs?: number;
  wait?: (ms: number) => Promise<void>;
}

export async function runBulkLaunchQueue<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  options: BulkLaunchQueueOptions = {}
): Promise<void> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? BULK_LAUNCH_CONCURRENCY));
  const staggerMs = Math.max(0, Math.floor(options.staggerMs ?? BULK_LAUNCH_STAGGER_MS));
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let nextIndex = 0;
  let launchCount = 0;
  let launchGate = Promise.resolve();

  const waitForLaunchTurn = async (): Promise<void> => {
    const shouldWait = launchCount > 0 && staggerMs > 0;
    launchCount += 1;
    if (!shouldWait) {
      return;
    }

    const turn = launchGate.then(() => wait(staggerMs));
    launchGate = turn.catch(() => {});
    await turn;
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await waitForLaunchTurn();
      await worker(item);
    }
  });

  await Promise.all(workers);
}
