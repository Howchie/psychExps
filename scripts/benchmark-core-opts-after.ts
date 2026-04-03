import { createVariableResolver } from "../packages/core/src/infrastructure/variables";

const SAMPLER_KEYS = new Set([
  "type", "values", "items", "options", "weights", "without_replacement",
  "withoutReplacement", "draw", "mode", "min", "max", "mu", "sd", "lambda", "k", "size", "dispersion", "r",
]);

function hasSamplerShapeAfter(value: Record<string, unknown>): boolean {
  for (const key of SAMPLER_KEYS) {
    if (key in value) return true;
  }
  return false;
}

function matchesWhenAfter(
  when: any,
  blockContext: { blockIndex: number; blockLabel: string; blockType: string; isPractice: boolean },
): boolean {
  if (!when) return true;
  if (when.blockIndex && when.blockIndex.size > 0 && !when.blockIndex.has(blockContext.blockIndex)) {
    return false;
  }
  if (when.blockLabel && when.blockLabel.size > 0 && !when.blockLabel.has(blockContext.blockLabel)) {
    return false;
  }
  if (when.blockType && when.blockType.size > 0 && !when.blockType.has(blockContext.blockType)) {
    return false;
  }
  if (typeof when.isPractice === "boolean" && when.isPractice !== blockContext.isPractice) {
    return false;
  }
  return true;
}

function validateTaskConfigIsolationAfter(taskId: string, config: any, knownTaskIds?: string[]): void {
  const forbiddenByTask: Record<string, string[]> = {
    sft: ["nback", "bricks"],
    bricks: ["sft", "nback"],
    nback: ["sft", "bricks"],
  };
  const task = config.task && typeof config.task === 'object' && !Array.isArray(config.task) ? config.task : {};
  const forbiddenRoots =
    Array.isArray(knownTaskIds) && knownTaskIds.length > 0
      ? knownTaskIds.filter((id) => id !== taskId)
      : forbiddenByTask[taskId] ?? [];

  const rootKeySet = new Set(Object.keys(config));
  for (const key of forbiddenRoots) {
    if (rootKeySet.has(key)) {
       // do nothing
    }
  }
}

// Benchmark hasSamplerShape
const obj = { some: "value", another: "thing", weights: [1, 2, 3] };
let start = performance.now();
for (let i = 0; i < 1000000; i++) {
  hasSamplerShapeAfter(obj);
}
let end = performance.now();
console.log(`hasSamplerShape (after): ${end - start}ms`);

// Benchmark matchesWhen
const when = {
  blockIndex: new Set([1, 2, 3, 4, 5]),
  blockLabel: new Set(["A", "B", "C", "D", "E"]),
  blockType: new Set(["test", "practice"]),
};
const ctx = { blockIndex: 10, blockLabel: "Z", blockType: "other", isPractice: false };
start = performance.now();
for (let i = 0; i < 1000000; i++) {
  matchesWhenAfter(when, ctx);
}
end = performance.now();
console.log(`matchesWhen (after): ${end - start}ms`);

// Benchmark validateTaskConfigIsolation
const config = { task: {}, sft: {}, nback: {}, other: 1, more: 2, keys: 3 };
const knownTaskIds = ["sft", "nback", "bricks", "otherTask"];
start = performance.now();
for (let i = 0; i < 1000000; i++) {
  validateTaskConfigIsolationAfter("bricks", config, knownTaskIds);
}
end = performance.now();
console.log(`validateTaskConfigIsolation (after): ${end - start}ms`);

// Benchmark computeBlockSummaryStats filtering (the inner part)
const trialResults = Array.from({ length: 1000 }, (_, i) => ({
  type: i % 2 === 0 ? "A" : "B",
  value: i,
}));
const where = { type: ["A", "C", "D"] };

function computeBlockSummaryStatsInnerAfter(rows: any[], where: any) {
  const whereSpecs = where ? Object.entries(where).map(([field, expectedRaw]) => {
    const expectedValues = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];
    return { field, expectedSet: new Set(expectedValues.map(v => String(v))) };
  }) : null;

  return whereSpecs ? rows.filter((row) => {
    for (const { field, expectedSet } of whereSpecs) {
      const actual = row[field];
      if (!expectedSet.has(String(actual))) return false;
    }
    return true;
  }) : rows;
}

start = performance.now();
for (let i = 0; i < 1000; i++) {
  computeBlockSummaryStatsInnerAfter(trialResults, where);
}
end = performance.now();
console.log(`computeBlockSummaryStats filtering (after): ${end - start}ms`);
