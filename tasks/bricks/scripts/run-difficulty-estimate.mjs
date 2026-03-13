#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { estimateTrialDifficulty } from "../dist/runtime/difficulty_estimator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const bricksConfigDir = path.join(repoRoot, "configs", "bricks");

function printUsageAndExit(code = 0) {
  console.log(
    [
      "Usage:",
      "  node tasks/bricks/scripts/run-difficulty-estimate.mjs --config moray1991 [--trials 10000] [--seed 123456]",
      "    [--no-by-trial-type] [--no-by-block-trial-type]",
      "",
      "Notes:",
      "  - Config is resolved under configs/bricks/<config>.json",
      "  - Output includes overall summary plus breakdowns by block and trial_type (plan variant id).",
      "  - Use --no-by-trial-type to omit breakdown.by_trial_type.",
      "  - Use --no-by-block-trial-type (or --no-block-trial-type) to omit breakdown.by_block_trial_type.",
      "  - Default config: moray1991",
      "  - Default trials: 10000",
      "  - Default seed: 123456",
    ].join("\n"),
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = {
    config: "moray1991",
    trials: 10000,
    seed: 123456,
    includeByTrialType: true,
    includeByBlockTrialType: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printUsageAndExit(0);
    } else if (arg === "--config") {
      out.config = String(argv[i + 1] ?? "").trim();
      i += 1;
    } else if (arg === "--trials") {
      out.trials = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--seed") {
      out.seed = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--no-by-trial-type") {
      out.includeByTrialType = false;
    } else if (arg === "--no-by-block-trial-type" || arg === "--no-block-trial-type") {
      out.includeByBlockTrialType = false;
    } else if (!arg.startsWith("-") && !out._positionalConsumed) {
      out.config = String(arg).trim();
      out._positionalConsumed = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.config) throw new Error("Missing config name.");
  if (!Number.isFinite(out.trials) || out.trials <= 0) throw new Error("--trials must be a positive number.");
  if (!Number.isFinite(out.seed)) throw new Error("--seed must be a finite number.");
  out.trials = Math.floor(out.trials);
  out.seed = Math.floor(out.seed);
  delete out._positionalConsumed;
  return out;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function toFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sampleFromSpec(spec, rand) {
  if (Array.isArray(spec)) {
    return spec[Math.floor(rand() * spec.length)];
  }
  if (spec && typeof spec === "object") {
    const type = String(spec.type ?? "fixed").toLowerCase();
    if (type === "fixed") return spec.value;
    if (type === "uniform") {
      const min = toFinite(spec.min, 0);
      const max = toFinite(spec.max, min);
      if (max <= min) return min;
      return min + (max - min) * rand();
    }
    if (type === "list") {
      const values = Array.isArray(spec.values) ? spec.values : [];
      if (values.length === 0) return null;
      return values[Math.floor(rand() * values.length)];
    }
    if (Object.prototype.hasOwnProperty.call(spec, "value")) return spec.value;
  }
  return spec;
}

function shuffle(items, rand) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepClone(v)]));
  }
  return value;
}

function deepMerge(target, source) {
  if (!isObject(source)) return target;
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      target[key] = value.map((item) => deepClone(item));
    } else if (isObject(value)) {
      const existing = isObject(target[key]) ? target[key] : {};
      target[key] = deepMerge(existing, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function hashSeedParts(parts) {
  let h = 2166136261 >>> 0;
  const input = parts.map((part) => String(part)).join("|");
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pickWeightedIndex(weights, rand) {
  const total = weights.reduce((acc, value) => acc + value, 0);
  if (!(total > 0)) return Math.floor(rand() * weights.length);
  let threshold = rand() * total;
  for (let i = 0; i < weights.length; i += 1) {
    threshold -= weights[i];
    if (threshold <= 0 || i === weights.length - 1) return i;
  }
  return weights.length - 1;
}

function computeQuotaCounts(weights, totalCount) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  if (!(sum > 0) || totalCount <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (weight / sum) * totalCount);
  const base = raw.map((value) => Math.floor(value));
  let assigned = base.reduce((acc, value) => acc + value, 0);
  if (assigned < totalCount) {
    const ranked = raw
      .map((value, index) => ({ index, remainder: value - base[index] }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    let cursor = 0;
    while (assigned < totalCount) {
      const next = ranked[cursor % ranked.length];
      base[next.index] += 1;
      assigned += 1;
      cursor += 1;
    }
  }
  return base;
}

function buildScheduledItems({ items, count, schedule, weights, rand, resolveToken }) {
  if (!Array.isArray(items) || items.length === 0 || count <= 0) return [];
  const scheduleSpec = isObject(schedule) ? schedule : {};
  const mode = String(scheduleSpec.mode ?? "weighted").trim().toLowerCase();
  const itemWeights = Array.isArray(weights) && weights.length === items.length
    ? weights.map((value) => Number(value))
    : items.map(() => 1);

  if (mode === "sequence") {
    const sequence = Array.isArray(scheduleSpec.sequence) && scheduleSpec.sequence.length > 0
      ? scheduleSpec.sequence
      : items.map((_, index) => index);
    return Array.from({ length: count }, (_, index) => {
      const token = sequence[index % sequence.length];
      const resolved = typeof resolveToken === "function" ? resolveToken(token) : null;
      return resolved ?? items[0];
    });
  }

  if (mode === "quota_shuffle" || mode === "block_quota_shuffle") {
    const counts = computeQuotaCounts(itemWeights, count);
    const out = [];
    items.forEach((item, index) => {
      const n = counts[index] ?? 0;
      for (let i = 0; i < n; i += 1) out.push(item);
    });
    return shuffle(out, rand);
  }

  const withoutReplacement = scheduleSpec.withoutReplacement === true || scheduleSpec.without_replacement === true;
  if (!withoutReplacement) {
    return Array.from({ length: count }, () => items[pickWeightedIndex(itemWeights, rand)]);
  }

  const out = [];
  let pool = [];
  const buildWeightedPermutation = () => {
    const remainingItems = items.slice();
    const remainingWeights = itemWeights.slice();
    const perm = [];
    while (remainingItems.length > 0) {
      const index = pickWeightedIndex(remainingWeights, rand);
      perm.push(remainingItems[index]);
      remainingItems.splice(index, 1);
      remainingWeights.splice(index, 1);
    }
    return perm;
  };
  for (let i = 0; i < count; i += 1) {
    if (pool.length === 0) pool = buildWeightedPermutation();
    const next = pool.shift();
    if (next != null) out.push(next);
  }
  return out;
}

function createManipulationPoolAllocator(value, seedParts) {
  const poolsRaw = isObject(value) ? value : null;
  const pools = new Map();
  if (poolsRaw) {
    for (const [poolId, entriesRaw] of Object.entries(poolsRaw)) {
      const entries = [];
      for (const entry of Array.isArray(entriesRaw) ? entriesRaw : []) {
        if (typeof entry === "string" && entry.trim()) {
          entries.push([entry.trim()]);
          continue;
        }
        if (Array.isArray(entry)) {
          const list = entry.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
          if (list.length > 0) entries.push(list);
        }
      }
      if (entries.length > 0) pools.set(poolId, entries);
    }
  }

  const rng = mulberry32(hashSeedParts(seedParts));
  const queueByPool = new Map();
  return {
    next(poolId) {
      const source = pools.get(poolId);
      if (!source || source.length === 0) return null;
      let queue = queueByPool.get(poolId) ?? [];
      if (queue.length === 0) queue = shuffle(source.map((entry) => [...entry]), rng);
      const picked = queue.shift() ?? null;
      queueByPool.set(poolId, queue);
      return picked ? [...picked] : null;
    },
  };
}

function resolveBlockManipulationIds(blockLike, poolAllocator) {
  const block = isObject(blockLike) ? blockLike : null;
  if (!block) return [];
  const out = [];
  const poolId = typeof block.manipulationPool === "string" ? block.manipulationPool.trim() : "";
  if (poolId) {
    const fromPool = poolAllocator?.next(poolId) ?? null;
    if (fromPool && fromPool.length > 0) out.push(...fromPool);
  }
  const single = typeof block.manipulation === "string" ? block.manipulation.trim() : "";
  if (single) out.push(single);
  for (const idLike of Array.isArray(block.manipulations) ? block.manipulations : []) {
    const id = typeof idLike === "string" ? idLike.trim() : "";
    if (id) out.push(id);
  }
  return out;
}

function makeFieldResolver(fieldSpec, rand) {
  if (!fieldSpec || typeof fieldSpec !== "object" || Array.isArray(fieldSpec)) {
    return () => fieldSpec;
  }
  if (Array.isArray(fieldSpec.values)) {
    const values = fieldSpec.values.slice();
    if (values.length === 0) return () => null;
    const draw = String(fieldSpec.draw ?? fieldSpec.mode ?? "with_replacement").toLowerCase();
    if (draw === "sequence") {
      return (index) => values[index % values.length];
    }
    if (draw === "without_replacement") {
      let pool = shuffle(values, rand);
      let cursor = 0;
      return () => {
        if (cursor >= pool.length) {
          pool = shuffle(values, rand);
          cursor = 0;
        }
        const v = pool[cursor];
        cursor += 1;
        return v;
      };
    }
    return () => values[Math.floor(rand() * values.length)];
  }
  if (typeof fieldSpec.type === "string") {
    return () => sampleFromSpec(fieldSpec, rand);
  }
  return () => fieldSpec;
}

function materializeForcedSet(config, rand) {
  const bricksCfg = config?.bricks ?? {};
  const plan = bricksCfg?.forcedSetPlan;
  if (plan && typeof plan === "object" && plan.enable !== false) {
    const count = Math.max(0, Math.floor(toFinite(sampleFromSpec(plan.count ?? plan.n ?? 0, rand), 0)));
    if (count > 0) {
      const defaults = plan.defaults && typeof plan.defaults === "object" ? plan.defaults : {};
      const fields = plan.fields && typeof plan.fields === "object" ? plan.fields : {};
      const resolvers = Object.fromEntries(
        Object.entries(fields).map(([key, spec]) => [key, makeFieldResolver(spec, rand)]),
      );
      const out = [];
      for (let i = 0; i < count; i += 1) {
        const entry = { ...defaults };
        for (const [fieldKey, resolver] of Object.entries(resolvers)) {
          entry[fieldKey] = resolver(i);
        }
        out.push(entry);
      }
      return out;
    }
  }
  if (Array.isArray(bricksCfg?.forcedSet)) return bricksCfg.forcedSet;
  return [];
}

function makeConveyors(config, rand) {
  const n = Math.max(1, Math.floor(toFinite(config?.conveyors?.nConveyors, 4)));
  const lengthsSpec = config?.conveyors?.lengthPx;
  const speedSpec = config?.conveyors?.speedPxPerSec;
  const displayWidth = Math.max(200, toFinite(config?.display?.canvasWidth, 1000));
  const brickWidth = Math.max(8, toFinite(config?.display?.brickWidth, 80));
  const minLength = brickWidth * 2;

  const conveyors = [];
  for (let i = 0; i < n; i += 1) {
    let sampledLength;
    if (Array.isArray(lengthsSpec)) {
      sampledLength = toFinite(lengthsSpec[i] ?? lengthsSpec[lengthsSpec.length - 1], displayWidth);
    } else {
      sampledLength = toFinite(sampleFromSpec(lengthsSpec, rand), displayWidth);
    }
    const length = Math.max(minLength, sampledLength);
    const speed = Math.max(1e-6, toFinite(sampleFromSpec(speedSpec, rand), 1));
    conveyors.push({ id: `c${i}`, index: i, length, speed });
  }
  return conveyors;
}

function makeBricks(config, conveyors, rand) {
  const forcedSet = materializeForcedSet(config, rand);
  if (forcedSet.length > 0) {
    const out = [];
    for (let i = 0; i < forcedSet.length; i += 1) {
      const entry = forcedSet[i] ?? {};
      const conveyorIndexRaw = toFinite(
        sampleFromSpec(entry.conveyorIndex ?? entry.conveyor_index ?? 0, rand),
        0,
      );
      const conveyorIndex = clamp(Math.floor(conveyorIndexRaw), 0, conveyors.length - 1);
      const conveyor = conveyors[conveyorIndex];

      const sampledWidth = sampleFromSpec(entry.width ?? entry.processingWidthPx ?? entry.processing_width_px, rand);
      const width = Math.max(8, toFinite(sampledWidth, toFinite(config?.display?.brickWidth, 80)));
      const maxX = Math.max(0, conveyor.length - width);

      const xRaw = toFinite(sampleFromSpec(entry.x, rand), Number.NaN);
      const xFracRaw = toFinite(sampleFromSpec(entry.xFraction ?? entry.x_fraction, rand), Number.NaN);
      const rightEdgeRaw = toFinite(sampleFromSpec(entry.rightEdge ?? entry.right_edge, rand), Number.NaN);
      const rightEdgeFracRaw = toFinite(
        sampleFromSpec(entry.rightEdgeFraction ?? entry.right_edge_fraction, rand),
        Number.NaN,
      );
      const fallbackFrac = (i + 1) / (forcedSet.length + 1);
      const x = Number.isFinite(xRaw)
        ? clamp(xRaw, 0, maxX)
        : Number.isFinite(rightEdgeRaw)
          ? clamp(rightEdgeRaw - width, 0, maxX)
          : Number.isFinite(rightEdgeFracRaw)
            ? clamp(rightEdgeFracRaw * conveyor.length - width, 0, maxX)
            : Number.isFinite(xFracRaw)
              ? clamp(xFracRaw * maxX, 0, maxX)
              : clamp(fallbackFrac * maxX, 0, maxX);

      out.push({
        id: `b${i + 1}`,
        conveyorId: conveyor.id,
        width,
        x,
        targetHoldMs: toFinite(sampleFromSpec(entry.targetHoldMs ?? entry.target_hold_ms, rand), Number.NaN),
        progressPerPerfect: toFinite(sampleFromSpec(entry.progressPerPerfect ?? entry.progress_per_perfect, rand), Number.NaN),
      });
    }
    return out;
  }

  // Fallback: synthesize from initialBricks if no forced set.
  const initialRaw = config?.bricks?.initialBricks;
  const initialCount = typeof initialRaw === "number"
    ? Math.max(0, Math.floor(initialRaw))
    : (initialRaw && initialRaw.type === "fixed")
      ? Math.max(0, Math.floor(toFinite(initialRaw.value, 0)))
      : 0;
  const width = Math.max(8, toFinite(config?.display?.brickWidth, 80));
  const out = [];
  for (let i = 0; i < initialCount; i += 1) {
    const conveyor = conveyors[i % conveyors.length];
    const maxX = Math.max(0, conveyor.length - width);
    const frac = (i + 1) / (initialCount + 1);
    out.push({ id: `b${i + 1}`, conveyorId: conveyor.id, width, x: frac * maxX });
  }
  return out;
}

function trialGameState(config, seed) {
  const rand = mulberry32(seed);
  const conveyors = makeConveyors(config, rand);
  const bricks = makeBricks(config, conveyors, rand);
  return {
    gameState: {
      bricks: new Map(bricks.map((b) => [b.id, b])),
      conveyors: conveyors.map((c) => ({ id: c.id, length: c.length, speed: c.speed })),
    },
    bricks,
    conveyors,
  };
}

function estimateMaxOnTimeClears(bricks, conveyors, config) {
  const byConveyor = new Map(conveyors.map((c) => [c.id, c]));
  const mode = String(config?.bricks?.completionMode ?? "single_click");

  const params = config?.bricks?.completionParams ?? {};
  const display = config?.display ?? {};
  const difficultyModel = config?.difficultyModel ?? {};

  const displayBrickWidth = Math.max(1, toFinite(display?.brickWidth, 160));

  const clickAcquireMs = Math.max(0, toFinite(difficultyModel?.clickAcquireMs, 110));
  const avgClickIntervalMs = Math.max(40, toFinite(difficultyModel?.avgClickIntervalMs, 240));

  const holdQualityMean = clamp(toFinite(config?.difficultyModel?.holdQualityMean, 0.5), 0, 1);
  const targetHoldMsCfg = Math.max(50, toFinite(params.target_hold_ms, 700));
  const progressPerPerfectCfg = clamp(toFinite(params.progress_per_perfect, 0.35), 0.01, 1);
  const progressCurve = Math.max(0.1, toFinite(params.progress_curve, 1));
  const widthScaling = params.width_scaling !== false;
  const widthRef = Math.max(1, toFinite(params.width_reference_px, displayBrickWidth));
  const widthExp = Math.max(0, toFinite(params.width_scaling_exponent, 1));

  const jobs = bricks.map((b) => {
    const conveyor = byConveyor.get(b.conveyorId);
    const speed = Math.max(1e-6, toFinite(conveyor?.speed, 1));
    const length = Math.max(0, toFinite(conveyor?.length, 0));
    const width = Math.max(1, toFinite(b.width, displayBrickWidth));
    const x = Math.max(0, toFinite(b.x, 0));
    const remainingDistance = Math.max(0, length - (x + width));

    let demandMs;
    let deadlineMs;

    if (mode === "hold_duration") {
      const targetHoldMs = Number.isFinite(b.targetHoldMs) ? Math.max(50, b.targetHoldMs) : targetHoldMsCfg;
      const progressPerPerfect = Number.isFinite(b.progressPerPerfect)
        ? clamp(b.progressPerPerfect, 0.01, 1)
        : progressPerPerfectCfg;
      const widthFactorRaw = widthScaling ? (width / widthRef) : 1;
      const widthFactor = Math.max(0.2, Math.pow(Math.max(0.01, widthFactorRaw), widthExp));
      const perfectGain = progressPerPerfect / widthFactor;
      const expectedGain = Math.max(1e-4, perfectGain * Math.pow(holdQualityMean, progressCurve));
      demandMs = (1 / expectedGain) * targetHoldMs;
      deadlineMs = (remainingDistance / speed) * 1000;
    } else if (mode === "hover_to_clear") {
      const processRatePxPerSec =
        Math.max(0, toFinite(config?.bricks?.completionParams?.hover_process_rate_px_s, speed)) || speed;
      demandMs = (width / processRatePxPerSec) * 1000;

      const rightEdgeDistance = length - (x + width);
      const edgeVelocityPxPerSec = speed - processRatePxPerSec;
      if (rightEdgeDistance <= 0) {
        deadlineMs = 0;
      } else if (edgeVelocityPxPerSec <= 0) {
        deadlineMs = Number.POSITIVE_INFINITY;
      } else {
        deadlineMs = (rightEdgeDistance / edgeVelocityPxPerSec) * 1000;
      }
    } else if (mode === "multi_click") {
      const clicksRequired = Math.max(1, Math.floor(toFinite(params.clicks_required, 2)));
      demandMs = clickAcquireMs + (clicksRequired * avgClickIntervalMs);
      deadlineMs = (remainingDistance / speed) * 1000;
    } else {
      // single_click and unknown-mode fallback mirror estimator click demand.
      demandMs = clickAcquireMs + avgClickIntervalMs;
      deadlineMs = (remainingDistance / speed) * 1000;
    }

    return { p: demandMs, d: deadlineMs };
  });

  // Moore-Hodgson algorithm: max number of jobs completed by deadlines on one server.
  const sorted = jobs.slice().sort((a, b) => a.d - b.d);
  let total = 0;
  const kept = [];
  for (const job of sorted) {
    kept.push(job);
    total += job.p;
    if (total > job.d) {
      let maxIdx = 0;
      for (let i = 1; i < kept.length; i += 1) {
        if (kept[i].p > kept[maxIdx].p) maxIdx = i;
      }
      total -= kept[maxIdx].p;
      kept.splice(maxIdx, 1);
    }
  }
  return kept.length;
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values, p) {
  const sorted = values.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function distribution(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ clears: value, count }));
}

function normalizeVariants(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const variant = entry;
      const id = typeof variant.id === "string" && variant.id.trim() ? variant.id.trim() : `variant_${index + 1}`;
      const label = typeof variant.label === "string" && variant.label.trim() ? variant.label.trim() : id;
      const weightNum = Number(variant.weight ?? 1);
      return {
        ...variant,
        id,
        label,
        weight: Number.isFinite(weightNum) && weightNum > 0 ? weightNum : 1,
      };
    })
    .filter(Boolean);
}

function resolveVariantToken(token, variants) {
  if (Number.isInteger(token) && Number(token) >= 0 && Number(token) < variants.length) {
    return variants[Number(token)];
  }
  if (typeof token === "string") {
    const key = token.trim();
    if (key) return variants.find((variant) => String(variant.id) === key) ?? null;
  }
  return null;
}

function buildTrialTemplates(config, seed, configId) {
  const blocks = Array.isArray(config?.blocks) ? config.blocks : [];
  if (blocks.length === 0) {
    return [
      {
        block_index: 0,
        block_label: "default",
        trial_index: 0,
        trial_type: "default",
        trial_type_label: "default",
        config,
      },
    ];
  }

  const manipulations = Array.isArray(config?.manipulations) ? config.manipulations : [];
  const manipulationById = new Map();
  for (const manipulation of manipulations) {
    const id = typeof manipulation?.id === "string" ? manipulation.id.trim() : "";
    if (id) manipulationById.set(id, manipulation);
  }

  const poolAllocator = createManipulationPoolAllocator(
    config?.manipulationPools,
    [configId, String(seed), "bricks_difficulty_script_pools"],
  );
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const templates = [];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex] ?? {};
    const manipulationIds = resolveBlockManipulationIds(block, poolAllocator);
    const selectedManipulations = manipulationIds.map((id) => {
      const found = manipulationById.get(id);
      if (!found) {
        throw new Error(`Difficulty config invalid: block ${blockIndex + 1} references unknown manipulation '${id}'.`);
      }
      return found;
    });

    const blockLabel = typeof block.label === "string" && block.label.trim() ? block.label.trim() : `Block ${blockIndex + 1}`;
    const trialsRaw = Number(block.trials ?? 1);
    const trialCount = Number.isFinite(trialsRaw) ? Math.max(1, Math.floor(trialsRaw)) : 1;

    const blockConfigBase = deepClone(config);
    for (const manipulation of selectedManipulations) {
      if (manipulation?.overrides && typeof manipulation.overrides === "object") {
        deepMerge(blockConfigBase, manipulation.overrides);
      }
    }
    if (block?.overrides && typeof block.overrides === "object") {
      deepMerge(blockConfigBase, block.overrides);
    }

    const trialPlanSource = selectedManipulations
      .slice()
      .reverse()
      .find((entry) => typeof entry?.trialPlan === "object" && entry.trialPlan !== null) ?? null;

    const variants = normalizeVariants(trialPlanSource?.trialPlan?.variants);
    const schedule = trialPlanSource?.trialPlan?.schedule;
    const scheduledVariants = variants.length
      ? buildScheduledItems({
          items: variants,
          count: trialCount,
          schedule,
          weights: variants.map((variant) => Number(variant.weight ?? 1)),
          rand: rng,
          resolveToken: (token) => resolveVariantToken(token, variants),
        })
      : [];

    for (let trialIndex = 0; trialIndex < trialCount; trialIndex += 1) {
      const trialConfig = deepClone(blockConfigBase);
      const variant = scheduledVariants[trialIndex] ?? null;
      if (variant?.overrides && typeof variant.overrides === "object") {
        deepMerge(trialConfig, variant.overrides);
      }
      templates.push({
        block_index: blockIndex,
        block_label: blockLabel,
        trial_index: trialIndex,
        trial_type: variant?.id ?? "default",
        trial_type_label: variant?.label ?? "default",
        config: trialConfig,
      });
    }
  }

  return templates;
}

function createAccumulator() {
  return {
    n: 0,
    feasibility: [],
    load: [],
    clearable: [],
  };
}

function updateAccumulator(acc, feasibilityPct, loadPct, maxClears) {
  acc.n += 1;
  acc.feasibility.push(feasibilityPct);
  acc.load.push(loadPct);
  acc.clearable.push(maxClears);
}

function summarizeAccumulator(acc) {
  const n = Math.max(1, acc.n);
  const clearDist = distribution(acc.clearable).map((row) => ({
    ...row,
    pct: (row.count * 100) / n,
  }));
  return {
    n: acc.n,
    feasibility_pct: {
      mean: mean(acc.feasibility),
      p10: percentile(acc.feasibility, 10),
      p50: percentile(acc.feasibility, 50),
      p90: percentile(acc.feasibility, 90),
    },
    load_pct: {
      mean: mean(acc.load),
      p10: percentile(acc.load, 10),
      p50: percentile(acc.load, 50),
      p90: percentile(acc.load, 90),
    },
    max_on_time_clears: {
      mean: mean(acc.clearable),
      distribution: clearDist,
    },
  };
}

function summarizeGroupMap(groupMap, parseKey) {
  return [...groupMap.entries()]
    .map(([key, acc]) => ({ ...parseKey(key), ...summarizeAccumulator(acc) }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function loadConfig(configName) {
  const base = configName.endsWith(".json") ? configName.slice(0, -5) : configName;
  const fullPath = path.join(bricksConfigDir, `${base}.json`);
  const raw = await readFile(fullPath, "utf8");
  const config = JSON.parse(raw);
  return { config, configPath: fullPath, configId: base };
}

async function main() {
  const {
    config: configName,
    trials,
    seed,
    includeByTrialType,
    includeByBlockTrialType,
  } = parseArgs(process.argv.slice(2));
  const { config, configPath, configId } = await loadConfig(configName);

  const templates = buildTrialTemplates(config, seed, configId);
  if (templates.length === 0) {
    throw new Error("No trial templates could be constructed from config.");
  }

  const overall = createAccumulator();
  const byBlock = new Map();
  const byTrialType = includeByTrialType ? new Map() : null;
  const byBlockTrialType = includeByBlockTrialType ? new Map() : null;
  const pickTemplate = mulberry32((seed ^ 0xa341316c) >>> 0);

  for (let i = 0; i < trials; i += 1) {
    const template = templates[Math.floor(pickTemplate() * templates.length)] ?? templates[0];
    const trialSeed = (seed + i * 17) >>> 0;
    const trialCfg = template.config;
    const { gameState, bricks, conveyors } = trialGameState(trialCfg, trialSeed);
    const est = estimateTrialDifficulty(gameState, trialCfg);
    const feasibilityPct = Number(est.trial_feasibility_pct);
    const loadPct = Number(est.trial_load_pct);
    const maxClears = estimateMaxOnTimeClears(bricks, conveyors, trialCfg);

    updateAccumulator(overall, feasibilityPct, loadPct, maxClears);

    const blockKey = `${template.block_index}|${template.block_label}`;
    const trialTypeKey = String(template.trial_type ?? "default");
    const blockTrialTypeKey = `${blockKey}|${trialTypeKey}`;
    if (!byBlock.has(blockKey)) byBlock.set(blockKey, createAccumulator());
    if (byTrialType && !byTrialType.has(trialTypeKey)) byTrialType.set(trialTypeKey, createAccumulator());
    if (byBlockTrialType && !byBlockTrialType.has(blockTrialTypeKey)) {
      byBlockTrialType.set(blockTrialTypeKey, createAccumulator());
    }
    updateAccumulator(byBlock.get(blockKey), feasibilityPct, loadPct, maxClears);
    if (byTrialType) updateAccumulator(byTrialType.get(trialTypeKey), feasibilityPct, loadPct, maxClears);
    if (byBlockTrialType) {
      updateAccumulator(byBlockTrialType.get(blockTrialTypeKey), feasibilityPct, loadPct, maxClears);
    }
  }

  const byBlockSummary = summarizeGroupMap(byBlock, (key) => {
    const [blockIndexRaw, blockLabel] = String(key).split("|");
    return { block_index: Number(blockIndexRaw), block_label: blockLabel };
  });
  const byTrialTypeSummary = byTrialType
    ? summarizeGroupMap(byTrialType, (key) => ({
        trial_type: String(key),
      }))
    : null;
  const byBlockTrialTypeSummary = byBlockTrialType
    ? summarizeGroupMap(byBlockTrialType, (key) => {
        const [blockIndexRaw, blockLabel, trialType] = String(key).split("|");
        return {
          block_index: Number(blockIndexRaw),
          block_label: blockLabel,
          trial_type: trialType,
        };
      })
    : null;

  const breakdown = {
    by_block: byBlockSummary,
  };
  if (byTrialTypeSummary) {
    breakdown.by_trial_type = byTrialTypeSummary;
  }
  if (byBlockTrialTypeSummary) {
    breakdown.by_block_trial_type = byBlockTrialTypeSummary;
  }

  const summary = {
    config: configId,
    config_path: configPath,
    trials,
    seed,
    templates: {
      total: templates.length,
      blocks: [...new Set(templates.map((template) => `${template.block_index}|${template.block_label}`))].length,
      trial_types: [...new Set(templates.map((template) => String(template.trial_type ?? "default")))].length,
    },
    overall: summarizeAccumulator(overall),
    breakdown,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`Difficulty run failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
