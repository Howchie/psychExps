import {
  buildScheduledItems,
  createMulberry32,
  createEventLogger,
  deepClone,
  deepMerge,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  escapeHtml,
  finalizeTaskRun,
  hashSeed,
  renderCenteredNotice,
  runBlockTrialLoop,
  runPromptScreens,
  type JSONObject,
  type SelectionContext,
  type TaskAdapter,
} from '@experiments/core';
import { runConveyorTrial, type ConveyorTrialData } from './runtime/runConveyorTrial.js';

interface BlockPlanItem {
  index: number;
  label: string;
  trials: number;
  manipulationId: string | null;
  trialConfigs: Array<Record<string, unknown>>;
}

const adapter: TaskAdapter = {
  manifest: {
    taskId: 'bricks',
    label: 'Bricks (DiscoveryProject)',
    variants: [
      { id: 'baseline', label: 'Moray Baseline', configPath: 'bricks/baseline' },
      { id: 'moray1991', label: 'Moray 1991 VPT+VDD', configPath: 'bricks/moray1991' },
      { id: 'spotlight', label: 'Spotlight + DRT', configPath: 'bricks/spotlight' },
    ],
  },

  async launch(context) {
    const config = context.taskConfig as JSONObject;

    const root = context.container;
    root.style.maxWidth = '1200px';
    root.style.margin = '1rem auto';

    const rng = createMulberry32(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId));
    const blockPlan = buildBlockPlan(config, rng, context.selection);
    const records: ConveyorTrialData[] = [];
    const eventLogger = createEventLogger(context.selection);
    eventLogger.emit('task_start', { task: 'bricks' });

    await runPromptScreens(root, [
      {
        html: `<h2>${escapeHtml(String(((config as any).task as any)?.title ?? 'Bricks Task'))}</h2><p>Participant: <code>${escapeHtml(context.selection.participant.participantId)}</code></p>`,
        buttonId: "bricks-continue-btn-start",
      },
    ]);

    await runBlockTrialLoop<BlockPlanItem, Record<string, unknown>, ConveyorTrialData>({
      container: root,
      blocks: blockPlan,
      getTrials: (block) => block.trialConfigs,
      renderBlockStart: ({ block, blockIndex }) => {
        eventLogger.emit('block_start', { label: block.label, manipulationId: block.manipulationId }, { blockIndex });
        return `<h3>${escapeHtml(block.label)}</h3><p>Manipulation: <code>${escapeHtml(block.manipulationId ?? 'none')}</code></p><p>Trials: ${block.trials}</p>`;
      },
      blockStartButtonId: ({ block }) => `bricks-continue-btn-block-${block.index}`,
      runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
        const stageHost = document.createElement('div');
        root.innerHTML = '';
        root.appendChild(stageHost);
        const trialData = await runConveyorTrial({
          displayElement: stageHost,
          blockLabel: block.label,
          blockIndex: block.index,
          trialIndex,
          config: trial,
        });
        records.push(trialData);
        eventLogger.emit(
          'trial_complete',
          {
            endReason: trialData.end_reason,
            trialDurationMs: trialData.trial_duration_ms,
            game: (trialData as any).game?.stats ?? {},
            drt: (trialData as any).drt?.stats ?? {},
          },
          { blockIndex, trialIndex },
        );
        return trialData;
      },
      renderBlockEnd: ({ block, blockIndex, trialResults }) => {
        const totals = summarizeBlockTrials(trialResults);
        eventLogger.emit('block_end', { label: block.label, totals }, { blockIndex });
        return `<h3>End of ${escapeHtml(block.label)}</h3><ul><li>Bricks cleared: ${totals.cleared}</li><li>Bricks dropped: ${totals.dropped}</li><li>DRT hits: ${totals.hits}</li><li>DRT misses: ${totals.misses}</li></ul>`;
      },
      blockEndButtonId: ({ block }) => `bricks-continue-btn-end-${block.index}`,
    });

    eventLogger.emit('task_complete', { task: 'bricks', nTrials: records.length });
    const payload = { selection: context.selection, records, events: eventLogger.events };
    await finalizeTaskRun({
      coreConfig: context.coreConfig,
      selection: context.selection,
      payload,
      csv: { contents: recordsToCsv(records), suffix: "bricks" },
      completionStatus: "complete",
    });
    root.innerHTML = renderCenteredNotice({
      title: "Bricks complete",
      message: "Data saved locally.",
    });
  },
};

export const bricksAdapter = adapter;

function buildBlockPlan(
  config: Record<string, unknown>,
  rng: () => number,
  selection: SelectionContext,
): BlockPlanItem[] {
  const blocks = Array.isArray(config.blocks)
    ? (config.blocks as Array<Record<string, unknown>>)
    : [];
  const manipulations = Array.isArray(config.manipulations) ? (config.manipulations as Array<Record<string, unknown>>) : [];
  const manipulationById = new Map<string, Record<string, unknown>>();
  for (const manipulation of manipulations) {
    const id = typeof manipulation.id === 'string' ? manipulation.id.trim() : '';
    if (id) manipulationById.set(id, manipulation);
  }
  const poolAllocator = createManipulationPoolAllocator(
    (config as Record<string, unknown>).manipulationPools,
    [
      selection.participant.participantId,
      selection.participant.sessionId,
      selection.variantId,
      "bricks_manipulation_pools",
    ],
  );

  if (blocks.length === 0) {
    throw new Error('Bricks config invalid: expected non-empty `blocks`.');
  }

  return blocks.map((block, index) => {
    const manipulationIds = resolveBlockManipulationIds(block, poolAllocator);
    const selectedManipulations = manipulationIds.map((id) => {
      const found = manipulationById.get(id);
      if (!found) throw new Error(`Bricks config invalid: block ${index + 1} references unknown manipulation '${id}'.`);
      return found;
    });
    const manipulationId = manipulationIds.length > 0 ? manipulationIds.join("+") : null;
    const label = typeof block.label === 'string' && block.label.trim() ? block.label.trim() : `Block ${index + 1}`;
    const trialsRaw = Number(block.trials ?? 1);
    const trials = Number.isFinite(trialsRaw) ? Math.max(1, Math.floor(trialsRaw)) : 1;

    const blockConfigBase = deepClone(config);
    for (const manipulation of selectedManipulations) {
      if (manipulation.overrides && typeof manipulation.overrides === 'object') {
        deepMerge(blockConfigBase as JSONObject, manipulation.overrides as JSONObject);
      }
    }
    if (block.overrides && typeof block.overrides === 'object') {
      deepMerge(blockConfigBase as JSONObject, block.overrides as JSONObject);
    }

    const trialPlanSource =
      selectedManipulations
        .slice()
        .reverse()
        .find((entry) => typeof (entry as any)?.trialPlan === "object" && (entry as any)?.trialPlan !== null) ?? null;
    const variants = normalizeVariants((trialPlanSource as any)?.trialPlan?.variants);
    const schedule = (trialPlanSource as any)?.trialPlan?.schedule;

    const scheduledVariants = variants.length
      ? (buildScheduledItems({
          items: variants,
          count: trials,
          schedule,
          weights: variants.map((variant) => Number(variant.weight ?? 1)),
          rng: { next: rng },
          resolveToken: (token: unknown) => {
            if (Number.isInteger(token) && Number(token) >= 0 && Number(token) < variants.length) {
              return variants[Number(token)];
            }
            if (typeof token === 'string') {
              const key = token.trim();
              if (key) return variants.find((variant) => String(variant.id) === key) ?? null;
            }
            return null;
          },
        }) as Array<Record<string, unknown>>)
      : [];

    const trialConfigs: Array<Record<string, unknown>> = Array.from({ length: trials }, (_, trialIndex) => {
      const trialConfig = deepClone(blockConfigBase);
      const variant = scheduledVariants[trialIndex] ?? null;
      if (variant && variant.overrides && typeof variant.overrides === 'object') {
        deepMerge(trialConfig as JSONObject, variant.overrides as JSONObject);
      }
      if (!(trialConfig.trial && typeof trialConfig.trial === 'object' && !Array.isArray(trialConfig.trial))) {
        trialConfig.trial = {};
      }
      (trialConfig.trial as Record<string, unknown>).planVariantId = (variant?.id ?? null) as unknown;
      (trialConfig.trial as Record<string, unknown>).planVariantLabel = (variant?.label ?? null) as unknown;
      return trialConfig;
    });

    return { index, label, trials, manipulationId, trialConfigs };
  });
}

function normalizeVariants(input: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object') return null;
      const variant = entry as Record<string, unknown>;
      const id = typeof variant.id === 'string' && variant.id.trim() ? variant.id.trim() : `variant_${index + 1}`;
      const label = typeof variant.label === 'string' && variant.label.trim() ? variant.label.trim() : id;
      const weightNum = Number(variant.weight ?? 1);
      return {
        ...variant,
        id,
        label,
        weight: Number.isFinite(weightNum) && weightNum > 0 ? weightNum : 1,
      } as Record<string, unknown>;
    })
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function summarizeBlockTrials(rows: ConveyorTrialData[]): { cleared: number; dropped: number; hits: number; misses: number } {
  return rows.reduce(
    (acc, row) => {
      const gameStats = ((row.game as any)?.stats ?? {}) as Record<string, number>;
      const drtStats = ((row.drt as any)?.stats ?? {}) as Record<string, number>;
      acc.cleared += Number(gameStats.cleared ?? 0);
      acc.dropped += Number(gameStats.dropped ?? 0);
      acc.hits += Number(drtStats.hits ?? 0);
      acc.misses += Number(drtStats.misses ?? 0);
      return acc;
    },
    { cleared: 0, dropped: 0, hits: 0, misses: 0 },
  );
}

function recordsToCsv(rows: ConveyorTrialData[]): string {
  const header = ['block_label', 'block_index', 'trial_index', 'trial_duration_ms', 'end_reason', 'cleared', 'dropped', 'spawned', 'drt_hits', 'drt_misses'];
  const lines = [header.join(',')];
  for (const row of rows) {
    const gameStats = ((row.game as any)?.stats ?? {}) as Record<string, unknown>;
    const drtStats = ((row.drt as any)?.stats ?? {}) as Record<string, unknown>;
    lines.push(
      [
        row.block_label,
        row.block_index,
        row.trial_index,
        row.trial_duration_ms,
        row.end_reason,
        Number(gameStats.cleared ?? 0),
        Number(gameStats.dropped ?? 0),
        Number(gameStats.spawned ?? 0),
        Number(drtStats.hits ?? 0),
        Number(drtStats.misses ?? 0),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\n');
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
