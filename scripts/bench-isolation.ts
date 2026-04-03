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
    if (rootKeys.includes(key)) {}
  }
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
    if (rootKeySet.has(key)) {}
  }
}

const config = { task: {}, sft: {}, nback: {}, other: 1, more: 2, keys: 3 };
const knownTaskIds = ["sft", "nback", "bricks", "otherTask"];

let start = performance.now();
for (let i = 0; i < 1000000; i++) {
  validateTaskConfigIsolationBaseline("bricks", config, knownTaskIds);
}
let end = performance.now();
console.log(`Baseline: ${end - start}ms`);

start = performance.now();
for (let i = 0; i < 1000000; i++) {
  validateTaskConfigIsolationAfter("bricks", config, knownTaskIds);
}
end = performance.now();
console.log(`After: ${end - start}ms`);
