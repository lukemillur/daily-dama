import { describe, expect, it, jest } from '@jest/globals';

import { createWriteQueue } from '@/shared/persistence/storage';

describe('createWriteQueue', () => {
  it('prevents a slower older write from overtaking newer state', async () => {
    const releases: (() => void)[] = [];
    const completed: number[] = [];
    const queue = createWriteQueue<number>(
      (value) =>
        new Promise<void>((resolve) => {
          releases.push(() => {
            completed.push(value);
            resolve();
          });
        }),
    );

    const first = queue(1);
    const second = queue(2);
    await Promise.resolve();
    expect(releases).toHaveLength(1);

    releases[0]();
    await first;
    await Promise.resolve();
    expect(releases).toHaveLength(2);

    releases[1]();
    await second;
    expect(completed).toEqual([1, 2]);
  });

  it('continues processing after a failed write', async () => {
    const write = jest
      .fn<(value: number) => Promise<void>>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(undefined);
    const queue = createWriteQueue(write);

    await expect(queue(1)).rejects.toThrow('failed');
    await expect(queue(2)).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
  });
});
