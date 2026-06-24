export const BULK_LAUNCH_CONCURRENCY = 2;
export const BULK_LAUNCH_STAGGER_MS = 800;

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
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async (_, workerIndex) => {
    for (let itemIndex = workerIndex; itemIndex < items.length; itemIndex += concurrency) {
      if (itemIndex > 0 && staggerMs > 0) {
        await wait(staggerMs);
      }

      await worker(items[itemIndex]);
    }
  });

  await Promise.all(workers);
}
