import { performance } from "perf_hooks";

const numTrials = 100;
const numBlocks = 10000;

function generateTrials(mixed = false) {
  const trials = [];
  for (let i = 0; i < numTrials; i++) {
    trials.push({ rule: mixed && i === numTrials - 1 ? "AND" : "OR" });
  }
  return trials;
}

const blocks = [];
for (let i = 0; i < numBlocks; i++) {
  blocks.push(generateTrials(i % 2 === 0));
}

function baseline() {
  let count = 0;
  const start = performance.now();
  for (const trials of blocks) {
    const rules = Array.from(new Set(trials.map((t) => t.rule)));
    const rule = rules.length === 1 ? rules[0] : "MIXED";
    if (rule === "OR") count++;
  }
  const end = performance.now();
  console.log(`Baseline: ${end - start} ms, count: ${count}`);
}

function optimized1() {
  let count = 0;
  const start = performance.now();
  for (const trials of blocks) {
    let rule = "MIXED";
    if (trials.length > 0) {
      rule = trials[0].rule;
      for (let i = 1; i < trials.length; i++) {
        if (trials[i].rule !== rule) {
          rule = "MIXED";
          break;
        }
      }
    }
    if (rule === "OR") count++;
  }
  const end = performance.now();
  console.log(`Optimized (for loop): ${end - start} ms, count: ${count}`);
}

function optimized2() {
  let count = 0;
  const start = performance.now();
  for (const trials of blocks) {
    const rule = trials.length > 0 && trials.every((t) => t.rule === trials[0].rule) ? trials[0].rule : "MIXED";
    if (rule === "OR") count++;
  }
  const end = performance.now();
  console.log(`Optimized (every): ${end - start} ms, count: ${count}`);
}

for (let i = 0; i < 5; i++) {
  baseline();
  optimized1();
  optimized2();
  console.log("---");
}
