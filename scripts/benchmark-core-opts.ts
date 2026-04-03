import { createVariableResolver } from "../packages/core/src/infrastructure/variables";
// We need to import the internal functions, but they might not be exported.
// I'll check if they are exported.
// hasSamplerShape is NOT exported in variables.ts.
// validateTaskConfigIsolation IS exported in validation.ts.
// computeBlockSummaryStats IS exported in blockSummary.ts.
// matchesWhen is NOT exported in blockSummary.ts.
// coerceInstructionInsertions IS exported in coerce.ts.

// Since some are not exported, I might need to copy their current implementation for the baseline
// or use some tricks. Actually, I can just re-implement the baseline logic in the benchmark.

const SAMPLER_KEYS = new Set([
  "type", "values", "items", "options", "weights", "without_replacement",
  "withoutReplacement", "draw", "mode", "min", "max", "mu", "sd", "lambda", "k", "size", "dispersion", "r",
]);

function hasSamplerShapeBaseline(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => SAMPLER_KEYS.has(key));
}

function matchesWhenBaseline(
  when: any,
  blockContext: { blockIndex: number; blockLabel: string; blockType: string; isPractice: boolean },
): boolean {
  if (!when) return true;
  if (Array.isArray(when.blockIndex) && when.blockIndex.length > 0 && !when.blockIndex.includes(blockContext.blockIndex)) {
    return false;
  }
  if (Array.isArray(when.blockLabel) && when.blockLabel.length > 0 && !when.blockLabel.includes(blockContext.blockLabel)) {
    return false;
  }
  if (Array.isArray(when.blockType) && when.blockType.length > 0 && !when.blockType.includes(blockContext.blockType)) {
    return false;
  }
  if (typeof when.isPractice === "boolean" && when.isPractice !== blockContext.isPractice) {
    return false;
  }
  return true;
}

function validateTaskConfigIsolationBaseline(taskId: string, config: any, knownTaskIds?: string[]): void {
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

  const rootKeys = Object.keys(config);
  for (const key of forbiddenRoots) {
    if (rootKeys.includes(key)) {
       // do nothing for bench
    }
  }
}

// Benchmark hasSamplerShape
const obj = { some: "value", another: "thing", weights: [1, 2, 3] };
let start = performance.now();
for (let i = 0; i < 1000000; i++) {
  hasSamplerShapeBaseline(obj);
}
let end = performance.now();
console.log(`hasSamplerShape (baseline): ${end - start}ms`);

// Benchmark matchesWhen
const when = {
  blockIndex: [1, 2, 3, 4, 5],
  blockLabel: ["A", "B", "C", "D", "E"],
  blockType: ["test", "practice"],
};
const ctx = { blockIndex: 10, blockLabel: "Z", blockType: "other", isPractice: false };
start = performance.now();
for (let i = 0; i < 1000000; i++) {
  matchesWhenBaseline(when, ctx);
}
end = performance.now();
console.log(`matchesWhen (baseline): ${end - start}ms`);

// Benchmark validateTaskConfigIsolation
const config = { task: {}, sft: {}, nback: {}, other: 1, more: 2, keys: 3 };
const knownTaskIds = ["sft", "nback", "bricks", "otherTask"];
start = performance.now();
for (let i = 0; i < 1000000; i++) {
  validateTaskConfigIsolationBaseline("bricks", config, knownTaskIds);
}
end = performance.now();
console.log(`validateTaskConfigIsolation (baseline): ${end - start}ms`);

// Benchmark computeBlockSummaryStats filtering (the inner part)
const trialResults = Array.from({ length: 1000 }, (_, i) => ({
  type: i % 2 === 0 ? "A" : "B",
  value: i,
}));
const where = { type: ["A", "C", "D"] };

function computeBlockSummaryStatsInnerBaseline(rows: any[], where: any) {
  return rows.filter((row) => {
    if (!where) return true;
    for (const [field, expectedRaw] of Object.entries(where)) {
      const actual = row[field];
      const expectedValues = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];
      const matched = expectedValues.some((expected) => String(actual) === String(expected));
      if (!matched) return false;
    }
    return true;
  });
}

start = performance.now();
for (let i = 0; i < 1000; i++) {
  computeBlockSummaryStatsInnerBaseline(trialResults, where);
}
end = performance.now();
console.log(`computeBlockSummaryStats filtering (baseline): ${end - start}ms`);
