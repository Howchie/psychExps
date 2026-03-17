import { Bench } from "tinybench";
import { buildScheduledItems } from "../packages/core/src/infrastructure/scheduler";

const items = Array.from({ length: 100 }, (_, i) => i);
const count = 10000;

const rng = { next: () => Math.random() };

const bench = new Bench({ time: 1000 });

bench.add("buildScheduledItems (withoutReplacement)", () => {
  buildScheduledItems({
    items,
    count,
    schedule: { withoutReplacement: true },
    rng,
  });
});

await bench.run();
console.table(bench.table());
