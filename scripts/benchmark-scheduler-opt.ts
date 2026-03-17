import { Bench } from "tinybench";

const defaultRng = { next: () => Math.random() };

function buildWeightedPermutation<T>(items: T[], weights: number[], rng: any): T[] {
  const remainingItems = items.slice();
  const remainingWeights = weights.slice();
  const output: T[] = [];
  let totalWeight = 0;
  for (let i = 0; i < remainingWeights.length; i += 1) {
    totalWeight += remainingWeights[i];
  }

  while (remainingItems.length > 0) {
    let index = 0;
    if (totalWeight > 0) {
      let threshold = rng.next() * totalWeight;
      for (let i = 0; i < remainingWeights.length; i += 1) {
        threshold -= remainingWeights[i];
        if (threshold <= 0 || i === remainingWeights.length - 1) {
          index = i;
          break;
        }
      }
    } else {
      index = Math.floor(rng.next() * remainingItems.length);
    }

    output.push(remainingItems[index]);

    const lastIndex = remainingItems.length - 1;
    totalWeight -= remainingWeights[index];

    if (index !== lastIndex) {
      remainingItems[index] = remainingItems[lastIndex];
      remainingWeights[index] = remainingWeights[lastIndex];
    }
    remainingItems.pop();
    remainingWeights.pop();
  }
  return output;
}

function buildScheduledItemsOld<T>(args: any): T[] {
  const {
    items,
    count,
    schedule,
    weights,
    rng = defaultRng,
  } = args;

  const itemWeights = Array.isArray(weights) && weights.length === items.length
    ? weights.map((value) => Number(value))
    : items.map(() => 1);

  const output: T[] = [];
  let pool: T[] = [];
  for (let i = 0; i < count; i += 1) {
    if (pool.length === 0) {
      pool = buildWeightedPermutation(items, itemWeights, rng);
    }
    const next = pool.shift(); // O(N) shift operation!
    if (next != null) output.push(next);
  }
  return output;
}

function buildScheduledItemsNew<T>(args: any): T[] {
  const {
    items,
    count,
    schedule,
    weights,
    rng = defaultRng,
  } = args;

  const itemWeights = Array.isArray(weights) && weights.length === items.length
    ? weights.map((value) => Number(value))
    : items.map(() => 1);

  const output: T[] = [];
  let pool: T[] = [];
  let poolCursor = 0; // O(1) index tracking!

  for (let i = 0; i < count; i += 1) {
    if (poolCursor >= pool.length) {
      pool = buildWeightedPermutation(items, itemWeights, rng);
      poolCursor = 0;
    }
    const next = pool[poolCursor++];
    if (next != null) output.push(next);
  }
  return output;
}

const items = Array.from({ length: 100 }, (_, i) => i);
const count = 10000;
const rng = { next: () => Math.random() };

const bench = new Bench({ time: 1000 });

bench.add("buildScheduledItemsOld (pool.shift)", () => {
  buildScheduledItemsOld({
    items,
    count,
    schedule: { withoutReplacement: true },
    rng,
  });
});

bench.add("buildScheduledItemsNew (poolCursor)", () => {
  buildScheduledItemsNew({
    items,
    count,
    schedule: { withoutReplacement: true },
    rng,
  });
});

await bench.run();
console.table(bench.table());
