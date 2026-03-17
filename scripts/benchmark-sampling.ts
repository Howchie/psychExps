import { Bench } from "tinybench";
import { createSampler } from "../packages/core/src/infrastructure/sampling";

const items = Array.from({ length: 100 }, (_, i) => i);

const bench = new Bench({ time: 1000 });

bench.add("createSampler (list, withoutReplacement)", () => {
  const sampler = createSampler({
    type: "list",
    values: items,
    draw: "without_replacement",
  });
  for (let i = 0; i < 10000; i++) {
    sampler();
  }
});

await bench.run();
console.table(bench.table());
