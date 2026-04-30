import {
  buildScheduledItems,
  createAtwitSurvey,
  createMulberry32,
  collectSurveyEntries,
  createInstructionRenderer,
  deepClone,
  deepMerge,
  findFirstSurveyScore,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  hashSeed,
  attachSurveyResults,
  maybeExportStimulusRows,
  parseSurveyDefinitions,
  applyTaskInstructionConfig,
  resolveInstructionScreenSlots,
  resolveTemplatedString,
  runSurveySequence,
  resolveBlockScreenSlotValue,
  asObject,
  asArray,
  asString,
  type JSONObject,
  type SelectionContext,
  type SurveyDefinition,
  type SurveyRunResult,
  type TaskAdapterContext,
  type TaskModuleAddress,
  type DrtController,
  resolveScopedModuleConfig,
  recordsToCsv,
  TaskOrchestrator,
  createTaskAdapter,
} from '@experiments/core';
import { resolveBricksDrtConfig, type BricksScopedDrtConfig } from './runtime/drtConfig.js';
import {
  addTrialStatsToAccumulator,
  applyResetRulesAt,
  buildHudBaseStats,
  createBricksStatsAccumulator,
  resolveBricksStatsPresentation,
} from './runtime/statsPresentation.js';
import {
  runConveyorTrial,
  type ConveyorTrialData,
  type ConveyorTrialDrtRuntime,
  type ConveyorTrialDrtRuntimeBindings,
} from './runtime/runConveyorTrial.js';
import { runHoldDurationPractice } from './runtime/runHoldDurationPractice.js';

interface BlockPlanItem {
  index: number;
  label: string;
  trials: number;
  manipulationId: string | null;
  phase: string | null;
  isPractice: boolean;
  trialConfigs: Array<Record<string, unknown>>;
}

interface ActiveBricksDrtScope {
  config: BricksScopedDrtConfig;
  bindings: ConveyorTrialDrtRuntimeBindings | null;
  activeTrialIndex: number | null;
}

function toBricksDrtScopeId(blockIndex: number, trialIndex: number | null): string {
  return `B${blockIndex}${trialIndex !== null ? `T${trialIndex}` : ""}`;
}

function isExplicitHoldDurationPracticeTrial(args: {
  block: Record<string, unknown>;
  trial: Record<string, unknown>;
}): boolean {
  const trialNode = asObject(args.trial?.trial) ?? {};
  const trialScoped = asObject(trialNode.holdDurationPractice) ?? asObject(args.trial?.holdDurationPractice);
  if (trialScoped) {
    return trialScoped.enabled !== false;
  }
  const blockScoped = asObject(args.block?.holdDurationPractice);
  if (blockScoped) {
    return blockScoped.enabled !== false;
  }
  if (args.block?.holdDurationPractice === true) {
    return true;
  }
  return false;
}

async function runBricksTask(context: TaskAdapterContext): Promise<unknown> {
  const { taskConfig, selection, resolver, container, moduleRunner } = context;

  const rng = createMulberry32(hashSeed(selection.participant.participantId, selection.participant.sessionId, selection.configPath ?? ""));
  const blockPlan = buildBlockPlan(taskConfig as Record<string, unknown>, rng, selection);
  const instructionsRaw = asObject((taskConfig as Record<string, unknown>).instructions) ?? {};
  const instructionSlots = resolveInstructionScreenSlots(instructionsRaw);
  const blockIntroTemplate = asString(instructionsRaw.blockIntroTemplate);
  const showBlockLabel = instructionsRaw.showBlockLabel !== false;
  const preBlockBeforeBlockIntro = instructionsRaw.preBlockBeforeBlockIntro === true;
  const statsPresentation = resolveBricksStatsPresentation(taskConfig);
  const statsAccumulator = createBricksStatsAccumulator();

  const eventLogger = context.eventLogger;
  const activeDrtScopes = new Map<string, ActiveBricksDrtScope>();
  const blockDrtPreviousStats = new Map<number, Record<string, number>>();

  moduleRunner.setOptions({
    onEvent: (event) => {
      const address = (event as any).address as TaskModuleAddress | undefined;
      const scopeId = (address?.blockIndex != null)
        ? toBricksDrtScopeId(address.blockIndex, address.trialIndex)
        : null;
      const active = scopeId ? activeDrtScopes.get(scopeId) : undefined;

      if (event.type === "bricks_drt" || event.type.startsWith("drt_")) {
        active?.bindings?.onEvent(event as unknown as Record<string, unknown>);
      }

      eventLogger.emit(event.type, event, {
        blockIndex: address?.blockIndex ?? -1,
        ...(typeof address?.trialIndex === "number" ? { trialIndex: address.trialIndex } : {}),
      });
    }
  });

  const orchestrator = new TaskOrchestrator<BlockPlanItem, Record<string, unknown>, ConveyorTrialData>(context);
  
  // Calculate experiment-wide maximum brick dimensions for consistent spotlight window
  const experimentMax = calculateExperimentMaxBrickDimensions(taskConfig as Record<string, unknown>);
  if (!(taskConfig.trial && typeof taskConfig.trial === 'object')) {
    (taskConfig as any).trial = {};
  }
  const trialNode = (taskConfig as any).trial;
  if (!(trialNode.forcedOrder && typeof trialNode.forcedOrder === 'object')) {
    trialNode.forcedOrder = {};
  }
  trialNode.forcedOrder.spotlightWidth = experimentMax.maxWidth;
  trialNode.forcedOrder.spotlightHeight = experimentMax.maxHeight;

  applyTaskInstructionConfig(taskConfig, {
    introPages: instructionSlots.intro,
    preBlockPages: instructionSlots.preBlock,
    postBlockPages: instructionSlots.postBlock,
    endPages: instructionSlots.end,
    blockIntroTemplate: blockIntroTemplate ?? "Press continue when ready.",
    showBlockLabel,
    preBlockBeforeBlockIntro: preBlockBeforeBlockIntro,
  });

  return await orchestrator.run({
    buttonIdPrefix: "bricks",
    stimulusExport: {
      rows: buildBricksStimulusRows(blockPlan),
      suffix: "bricks_stimulus_list",
    },
    resolveModuleContext: ({ scope, blockIndex, trialIndex }) => {
      const scopeId =
        scope === "trial"
          ? toBricksDrtScopeId(blockIndex, trialIndex)
          : toBricksDrtScopeId(blockIndex, null);
      return {
        displayElement: container,
        borderTargetRect: () => activeDrtScopes.get(scopeId)?.bindings?.displayElement?.getBoundingClientRect() ?? null,
      };
    },
    getBlocks: () => blockPlan,
    getTrials: ({ block }) => block.trialConfigs,
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "bricks" });
    },
    renderInstruction: createInstructionRenderer({
      showBlockLabel: false,
      resolvePage: (ctx) => {
        const blockIndex = ctx.blockLabel ? blockPlan.findIndex((b) => b.label === ctx.blockLabel) : undefined;
        const resolveField = (value?: string): string => {
          if (!value) return "";
          return resolveTemplatedString({
            template: value,
            vars: taskConfig as Record<string, unknown>,
            resolver,
            context: typeof blockIndex === "number" && blockIndex >= 0 ? { blockIndex } : undefined,
          });
        };
        const title = resolveField(ctx.pageTitle);
        const html = resolveField(ctx.pageHtml);
        const text = resolveField(ctx.pageText);
        return {
          pageText: text,
          ...(html ? { pageHtml: html } : {}),
          ...(title ? { pageTitle: title } : {}),
        };
      },
    }),
    onBlockStart: async ({ block, blockIndex }) => {
        eventLogger.emit("block_start", { label: block.label, manipulationId: block.manipulationId }, { blockIndex });
        blockDrtPreviousStats.delete(blockIndex);
        statsAccumulator.block = { spawned: 0, cleared: 0, dropped: 0, points: 0 };
        applyResetRulesAt(statsAccumulator, statsPresentation, "block_start", {
          label: block.label,
          manipulationId: block.manipulationId,
          phase: block.phase,
          isPractice: block.isPractice,
        });

    },
    runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
        const stageHost = document.createElement("div");
        stageHost.style.width = "100%";
        stageHost.style.minHeight = "70vh";
        stageHost.style.display = "flex";
        stageHost.style.justifyContent = "center";
        stageHost.style.alignItems = "center";
        container.innerHTML = "";
        container.appendChild(stageHost);

        const resolvedDrtConfig = resolveBricksDrtConfig(resolveScopedModuleConfig(trial, "drt"));
        let injectedDrtRuntime: ConveyorTrialDrtRuntime | undefined;
        let activeTrialController: DrtController | null = null;
        const scopeId = toBricksDrtScopeId(blockIndex, resolvedDrtConfig.scope === "trial" ? trialIndex : null);

        if (resolvedDrtConfig.enabled) {
          const moduleAddress: TaskModuleAddress =
            resolvedDrtConfig.scope === "trial"
              ? { scope: "trial", blockIndex, trialIndex }
              : { scope: "block", blockIndex, trialIndex: null };
          const handle = moduleRunner.getActiveHandle({
            moduleId: "drt",
            ...moduleAddress,
          });
          const controller = (handle?.controller as DrtController | null | undefined) ?? null;
          if (!controller) {
            throw new Error(
              `Bricks DRT is enabled for ${resolvedDrtConfig.scope} scope but no active DRT module handle was found at block ${blockIndex + 1}, trial ${trialIndex + 1}.`,
            );
          }
          const active = activeDrtScopes.get(scopeId) ?? {
            config: resolvedDrtConfig,
            bindings: null,
            activeTrialIndex: null,
          };
          active.config = resolvedDrtConfig;
          activeDrtScopes.set(scopeId, active);
          if (resolvedDrtConfig.scope === "trial") {
            activeTrialController = controller;
          }
          injectedDrtRuntime = {
            config: active.config,
            controller,
            stopOnCleanup: resolvedDrtConfig.scope === "trial",
            attachBindings: (bindings) => {
              active.bindings = bindings;
              active.activeTrialIndex = trialIndex;
            },
            detachBindings: () => {
              active.bindings = null;
              active.activeTrialIndex = null;
            },
          };
        }

        let record;
        const isHoldDurationPractice = isExplicitHoldDurationPracticeTrial({
          block: block as unknown as Record<string, unknown>,
          trial: trial as unknown as Record<string, unknown>,
        });

        if (isHoldDurationPractice) {
          record = await runHoldDurationPractice({
            displayElement: stageHost,
            blockLabel: block.label,
            blockIndex: block.index,
            trialIndex,
            config: trial,
            drtRuntime: injectedDrtRuntime,
            hudBaseStats: buildHudBaseStats(statsAccumulator, statsPresentation),
          });
        } else {
          record = await runConveyorTrial({
            displayElement: stageHost,
            blockLabel: block.label,
            blockIndex: block.index,
            trialIndex,
            config: trial,
            drtRuntime: injectedDrtRuntime,
            hudBaseStats: buildHudBaseStats(statsAccumulator, statsPresentation),
          });
        }

        if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "trial") {
          const trialHandle = moduleRunner.getActiveHandle({
            moduleId: "drt",
            scope: "trial",
            blockIndex,
            trialIndex,
          });
          const controller =
            activeTrialController ??
            ((trialHandle?.controller as DrtController | null | undefined) ?? null);
          if (controller) {
            const responseRows = controller.exportResponseRows() as unknown as Array<Record<string, unknown>>;
            const latestEstimate = responseRows
              .slice()
              .reverse()
              .map((row) => row.estimate as Record<string, unknown> | null | undefined)
              .find((estimate) => Boolean(estimate)) ?? null;
            const drtData = controller.exportData() as unknown as Record<string, unknown>;
            record = {
              ...record,
              drt: {
                ...drtData,
                transforms: controller.exportTransformData(),
                responseRows,
                ...(latestEstimate ? { transform_latest: latestEstimate } : {}),
              },
              drt_response_rows: responseRows,
            } as ConveyorTrialData;
          }
          activeDrtScopes.delete(scopeId);
        }

        // Handle block-scoped DRT stats
        if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "block") {
          const previousStats = blockDrtPreviousStats.get(blockIndex) ?? {};
          const activeData = moduleRunner.getActiveData({ moduleId: "drt", blockIndex });
          const currentDrtData = activeData[0]?.data;
          const currentStats = extractNumericStats((currentDrtData?.stats ?? {}) as Record<string, unknown>);
          const deltaStats = subtractStats(currentStats, previousStats);
          
          (record as any).drt_cumulative = currentDrtData;
          (record as any).drt = {
            ...(currentDrtData ?? {}),
            stats: deltaStats,
          };
          blockDrtPreviousStats.set(blockIndex, currentStats);
        }

        const surveyResults = await runConfiguredTrialSurveys(container, trial);
        record = withSurveyResults(record, surveyResults);

        eventLogger.emit("trial_complete", {
          endReason: record.end_reason,
          trialDurationMs: record.trial_duration_ms,
          game: (record as any).game?.stats ?? {},
          drt: (record as any).drt?.stats ?? {},
          surveys: surveyResults.map((entry) => ({
            surveyId: entry.surveyId,
            scores: entry.scores ?? {},
          })),
        }, { blockIndex, trialIndex });
        addTrialStatsToAccumulator(statsAccumulator, (record as any)?.game?.stats ?? {});
        (record as any).stats_scope_totals = {
          block: { ...statsAccumulator.block },
          experiment: { ...statsAccumulator.experiment },
        };

        return record;
    },
    onBlockEnd: async ({ block, blockIndex, trialResults }) => {
        const totals = summarizeBlockTrials(trialResults);
        eventLogger.emit("block_end", { label: block.label, totals }, { blockIndex });
        applyResetRulesAt(statsAccumulator, statsPresentation, "block_end", {
          label: block.label,
          manipulationId: block.manipulationId,
          phase: block.phase,
          isPractice: block.isPractice,
        });

        activeDrtScopes.delete(toBricksDrtScopeId(blockIndex, null));
        blockDrtPreviousStats.delete(blockIndex);
    },
    csvOptions: {
      suffix: "bricks_events",
      getRecords: (res) => buildBricksEventRows(
        res.blocks.flatMap((b: any) => b.trialResults) as ConveyorTrialData[],
        blockPlan,
        {
          participantId: selection.participant.participantId,
          configPath: selection.configPath ?? "",
        },
      ),
      getExtraCsvs: ({ sessionResult }) => {
        const trialRows = sessionResult.blocks.flatMap((b: any) => b.trialResults) as ConveyorTrialData[];
        const brickOutcomeRows = buildBricksBrickOutcomeRows(
          trialRows,
          blockPlan,
          {
            participantId: selection.participant.participantId,
            configPath: selection.configPath ?? "",
          },
        );
        const drtRows = buildBricksDrtRows(
          trialRows,
          blockPlan,
          {
            participantId: selection.participant.participantId,
            configPath: selection.configPath ?? "",
          },
        );
        const extras: Array<{ contents: string; suffix?: string }> = [];
        if (trialRows.length > 0) {
          extras.push({ contents: recordsToCsv(trialRows), suffix: "bricks_trial_summary" });
        }
        if (brickOutcomeRows.length > 0) {
          extras.push({ contents: recordsToCsv(brickOutcomeRows), suffix: "bricks_brick_outcomes" });
        }
        if (drtRows.length > 0) {
          extras.push({ contents: recordsToCsv(drtRows), suffix: "bricks_drt_rows" });
        }
        return extras;
      },
    },
    getTaskMetadata: (res) => ({
      drt_rows: buildBricksDrtRows(
        res.blocks.flatMap((b: any) => b.trialResults),
        blockPlan,
        {
          participantId: selection.participant.participantId,
          configPath: selection.configPath ?? "",
        },
      ),
    }),
  });
}

export const bricksAdapter = createTaskAdapter({
  manifest: {
    taskId: 'bricks',
    label: 'Bricks (DiscoveryProject)',
  },
  run: runBricksTask,
});

function buildBlockPlan(
  config: Record<string, unknown>,
  rng: () => number,
  selection: SelectionContext,
): BlockPlanItem[] {
  const planNode = asObject(config.plan);
  const blocks = Array.isArray(config.blocks)
    ? (config.blocks as Array<Record<string, unknown>>)
    : (Array.isArray(planNode?.blocks) ? (planNode.blocks as Array<Record<string, unknown>>) : []);
  const manipulations = Array.isArray(config.manipulations)
    ? (config.manipulations as Array<Record<string, unknown>>)
    : (Array.isArray(planNode?.manipulations) ? (planNode.manipulations as Array<Record<string, unknown>>) : []);
  const manipulationById = new Map<string, Record<string, unknown>>();
  for (const manipulation of manipulations) {
    const id = typeof manipulation.id === 'string' ? manipulation.id.trim() : '';
    if (id) manipulationById.set(id, manipulation);
  }
  const poolAllocator = createManipulationPoolAllocator(
    (config as Record<string, unknown>).manipulationPools ?? planNode?.manipulationPools,
    [
      selection.participant.participantId,
      selection.participant.sessionId,
      selection.configPath ?? "",
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
    const phase = typeof block.phase === 'string' && block.phase.trim().length > 0 ? block.phase.trim() : null;
    const isPractice =
      typeof block.isPractice === 'boolean'
        ? block.isPractice
        : (typeof phase === 'string' && phase.toLowerCase().includes('practice'));
    const trialsRaw = Number(block.trials ?? 1);
    const trials = Number.isFinite(trialsRaw) ? Math.max(1, Math.floor(trialsRaw)) : 1;
    const beforeBlockScreens = resolveBlockScreenSlotValue(block, "before");
    const afterBlockScreens = resolveBlockScreenSlotValue(block, "after");
    const repeatAfterBlockScreens = resolveBlockScreenSlotValue(block, "repeatAfter");

    const blockConfigBase = deepClone(config);
    for (const manipulation of selectedManipulations) {
      if (manipulation.overrides && typeof manipulation.overrides === 'object') {
        deepMerge(blockConfigBase as JSONObject, manipulation.overrides as JSONObject);
      }
    }
    if (block.overrides && typeof block.overrides === 'object') {
      deepMerge(blockConfigBase as JSONObject, block.overrides as JSONObject);
    }

    const trialPlanSource = selectedManipulations
      .slice()
      .reverse()
      .map((entry) => resolveManipulationTrialPlan(entry))
      .find((entry): entry is Record<string, unknown> => Boolean(entry)) ?? null;
    const variants = normalizeVariants(trialPlanSource?.variants);
    const schedule = asObject(trialPlanSource?.schedule) ?? null;

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
    const blockScopedDrt = resolveBlockScopedDrtConfig(trialConfigs);
    const blockModules = deepClone(asObject((block as Record<string, unknown>).modules) ?? {});
    if (blockScopedDrt && blockScopedDrt.enabled && blockScopedDrt.scope === "block") {
      (blockModules as Record<string, unknown>).drt = blockScopedDrt;
    }

    return {
      ...block,
      index,
      label,
      trials,
      manipulationId,
      phase,
      isPractice,
      beforeBlockScreens,
      afterBlockScreens,
      repeatAfterBlockScreens,
      ...(Object.keys(blockModules as Record<string, unknown>).length > 0
        ? { modules: blockModules }
        : {}),
      trialConfigs,
    };
  });
}

function resolveManipulationTrialPlan(manipulation: Record<string, unknown>): Record<string, unknown> | null {
  return asObject(manipulation.trialPlan) ?? asObject((manipulation as Record<string, unknown>).trial_plan);
}

function buildBricksStimulusRows(
  blockPlan: BlockPlanItem[],
): Array<Record<string, string | number | boolean | null>> {
  return blockPlan.flatMap((block) =>
    block.trialConfigs.map((trialConfig, trialIndex) => {
      const trialNode = asObject(trialConfig.trial);
      const drt = resolveBricksDrtConfig(resolveScopedModuleConfig(trialConfig, "drt"));
      const planVariantId = typeof trialNode?.planVariantId === "string" ? trialNode.planVariantId : null;
      return {
        block_index: block.index,
        block_label: block.label,
        trial_index: trialIndex,
        manipulation_id: block.manipulationId,
        plan_variant_id: planVariantId,
        plan_variant_label: typeof trialNode?.planVariantLabel === "string" ? trialNode.planVariantLabel : null,
        trial_code: planVariantId ?? "default",
        drt_enabled: drt.enabled,
        drt_scope: drt.enabled ? drt.scope : null,
      };
    }),
  );
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

function resolveBlockScopedDrtConfig(trialConfigs: Array<Record<string, unknown>>): BricksScopedDrtConfig | null {
  const blockScoped = trialConfigs
    .map((trialConfig) => resolveBricksDrtConfig(resolveScopedModuleConfig(trialConfig, "drt")))
    .filter((entry) => entry.enabled && entry.scope === "block");
  if (blockScoped.length === 0) return null;
  const canonical = JSON.stringify(blockScoped[0]);
  const hasMismatch = blockScoped.some((entry) => JSON.stringify(entry) !== canonical);
  if (hasMismatch) {
    console.warn("Bricks config includes mismatched block-scoped DRT settings within one block; using the first resolved config.");
  }
  return blockScoped[0];
}

function extractNumericStats(stats: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(stats)) {
    const num = Number(value);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

function subtractStats(current: Record<string, number>, previous: Record<string, number>): Record<string, number> {
  const keys = new Set<string>([...Object.keys(current), ...Object.keys(previous)]);
  const out: Record<string, number> = {};
  for (const key of keys) {
    const curr = Number(current[key] ?? 0);
    const prev = Number(previous[key] ?? 0);
    const delta = curr - prev;
    out[key] = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  }
  return out;
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

function blockHasEnabledDrt(rows: ConveyorTrialData[]): boolean {
  return rows.some((row) => {
    const drt = (row as any)?.drt;
    if (!drt || typeof drt !== 'object') return false;
    if (drt.enabled === true) return true;
    const presented = Number((drt.stats as any)?.presented ?? 0);
    return Number.isFinite(presented) && presented > 0;
  });
}

function toPrimitiveCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}

function flattenUnknown(
  value: unknown,
  prefix: string,
  out: Record<string, string | number | boolean | null>,
): void {
  if (value === null || value === undefined) {
    out[prefix] = null;
    return;
  }
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value);
    return;
  }
  if (typeof value !== "object") {
    out[prefix] = toPrimitiveCell(value);
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    out[prefix] = "{}";
    return;
  }
  for (const [key, nested] of entries) {
    const child = prefix ? `${prefix}_${String(key)}` : String(key);
    flattenUnknown(nested, child, out);
  }
}

function buildSpotlightLookup(row: ConveyorTrialData): {
  findSpotlightAtMs: (timeMs: number) => { spotlightBrickId: string | null; spotlightConveyorId: string | null };
} {
  const timeline = Array.isArray((row as any).timeline_events) ? ((row as any).timeline_events as Array<Record<string, unknown>>) : [];
  const sorted = timeline
    .map((entry) => ({
      time: Number(entry.time ?? entry.time_ms ?? 0),
      event: entry,
    }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);

  const brickToConveyor = new Map<string, string | null>();
  let spotlightBrickId: string | null = null;
  const checkpoints: Array<{ time: number; spotlightBrickId: string | null; spotlightConveyorId: string | null }> = [];

  for (const entry of sorted) {
    const event = entry.event;
    const type = String(event.type ?? "");
    if (type === "brick_spawned") {
      const brickId = typeof event.brick_id === "string" ? event.brick_id : null;
      const conveyorId = typeof event.conveyor_id === "string" ? event.conveyor_id : null;
      if (brickId) brickToConveyor.set(brickId, conveyorId);
    }
    if (type === "brick_focus_changed") {
      spotlightBrickId = typeof event.active_brick_id === "string" ? event.active_brick_id : null;
    }
    checkpoints.push({
      time: entry.time,
      spotlightBrickId,
      spotlightConveyorId: spotlightBrickId ? (brickToConveyor.get(spotlightBrickId) ?? null) : null,
    });
  }

  return {
    findSpotlightAtMs: (timeMs: number) => {
      if (checkpoints.length === 0) return { spotlightBrickId: null, spotlightConveyorId: null };
      let chosen: { spotlightBrickId: string | null; spotlightConveyorId: string | null } = {
        spotlightBrickId: null,
        spotlightConveyorId: null,
      };
      for (const checkpoint of checkpoints) {
        if (checkpoint.time > timeMs) break;
        chosen = {
          spotlightBrickId: checkpoint.spotlightBrickId,
          spotlightConveyorId: checkpoint.spotlightConveyorId,
        };
      }
      return chosen;
    },
  };
}

function buildTrialCsvContext(
  row: ConveyorTrialData,
  blockPlan: BlockPlanItem[],
  ids: { participantId: string; configPath: string },
): Record<string, string | number | boolean | null> {
  const blockMeta = blockPlan[row.block_index];
  return {
    participant_id: ids.participantId,
    config_path: ids.configPath,
    bricks_trial_id: `B${row.block_index}_T${row.trial_index}`,
    block_index: row.block_index,
    block_label: row.block_label,
    block_phase: blockMeta?.phase ?? null,
    block_is_practice: blockMeta?.isPractice ?? null,
    manipulation_id: blockMeta?.manipulationId ?? null,
    trial_index: row.trial_index,
    trial_duration_ms: row.trial_duration_ms,
    trial_end_reason: row.end_reason,
  };
}

function buildBricksEventRows(
  rows: ConveyorTrialData[],
  blockPlan: BlockPlanItem[],
  ids: { participantId: string; configPath: string },
): Array<Record<string, string | number | boolean | null>> {
  const out: Array<Record<string, string | number | boolean | null>> = [];
  for (const row of rows) {
    const trialContext = buildTrialCsvContext(row, blockPlan, ids);
    const timeline = Array.isArray((row as any).timeline_events)
      ? ((row as any).timeline_events as Array<Record<string, unknown>>)
      : [];
    timeline.forEach((event, eventIndex) => {
      const flat: Record<string, string | number | boolean | null> = {
        ...trialContext,
        event_index: eventIndex,
        event_time_ms: Number(event.time ?? event.time_ms ?? eventIndex),
        event_type: typeof event.type === "string" ? event.type : null,
      };
      flattenUnknown(event, "event", flat);
      out.push(flat);
    });

    const practicePressResults = Array.isArray((row as any).practice_press_results)
      ? ((row as any).practice_press_results as unknown[])
      : [];
    practicePressResults.forEach((result, pressIndex) => {
      out.push({
        ...trialContext,
        event_index: timeline.length + pressIndex,
        event_time_ms: null,
        event_type: "practice_press",
        practice_press_index: pressIndex,
        practice_press_correct: result === true,
      });
    });
  }
  return out;
}

function buildBricksBrickOutcomeRows(
  rows: ConveyorTrialData[],
  blockPlan: BlockPlanItem[],
  ids: { participantId: string; configPath: string },
): Array<Record<string, string | number | boolean | null>> {
  const out: Array<Record<string, string | number | boolean | null>> = [];

  for (const row of rows) {
    const trialContext = buildTrialCsvContext(row, blockPlan, ids);
    const timeline = Array.isArray((row as any).timeline_events)
      ? ((row as any).timeline_events as Array<Record<string, unknown>>)
      : [];

    type BrickState = {
      conveyorId: string | null;
      spawnTimeMs: number | null;
      clickCount: number;
      holdCount: number;
      status: "cleared" | "dropped" | "active_at_trial_end";
      terminalTimeMs: number | null;
      lifetimeMs: number | null;
      value: number | null;
      completionMode: string | null;
    };
    const byBrick = new Map<string, BrickState>();
    const ensure = (brickId: string): BrickState => {
      const existing = byBrick.get(brickId);
      if (existing) return existing;
      const created: BrickState = {
        conveyorId: null,
        spawnTimeMs: null,
        clickCount: 0,
        holdCount: 0,
        status: "active_at_trial_end",
        terminalTimeMs: null,
        lifetimeMs: null,
        value: null,
        completionMode: null,
      };
      byBrick.set(brickId, created);
      return created;
    };

    for (const event of timeline) {
      const type = String(event.type ?? "");
      const brickId = typeof event.brick_id === "string" ? event.brick_id : null;
      if (!brickId) continue;
      const state = ensure(brickId);
      if (typeof event.conveyor_id === "string") state.conveyorId = event.conveyor_id;
      if (Number.isFinite(Number(event.value))) state.value = Number(event.value);
      if (type === "brick_spawned") {
        const t = Number(event.time ?? event.time_ms ?? NaN);
        state.spawnTimeMs = Number.isFinite(t) ? t : state.spawnTimeMs;
      } else if (type === "brick_click") {
        if (event.valid === true) state.clickCount += 1;
      } else if (type === "brick_hold") {
        if (event.valid === true) state.holdCount += 1;
      } else if (type === "brick_cleared" || type === "brick_dropped") {
        const t = Number(event.time ?? event.time_ms ?? NaN);
        state.status = type === "brick_cleared" ? "cleared" : "dropped";
        state.terminalTimeMs = Number.isFinite(t) ? t : null;
        state.lifetimeMs = Number.isFinite(Number(event.lifetime)) ? Number(event.lifetime) : null;
        state.completionMode = typeof event.completion_mode === "string" ? event.completion_mode : null;
      }
    }

    for (const [brickId, state] of byBrick.entries()) {
      out.push({
        ...trialContext,
        brick_id: brickId,
        conveyor_id: state.conveyorId,
        brick_spawn_time_ms: state.spawnTimeMs,
        brick_terminal_time_ms: state.terminalTimeMs,
        brick_lifetime_ms: state.lifetimeMs,
        brick_click_count: state.clickCount,
        brick_hold_count: state.holdCount,
        brick_value: state.value,
        brick_completion_mode: state.completionMode,
        brick_final_status: state.status,
      });
    }
  }

  return out;
}

function buildBricksDrtRows(
  rows: ConveyorTrialData[],
  blockPlan: BlockPlanItem[],
  ids: { participantId: string; configPath: string },
): Array<Record<string, string | number | boolean | null>> {
  const out: Array<Record<string, string | number | boolean | null>> = [];

  for (const row of rows) {
    const responseRows = Array.isArray((row as any).drt_response_rows)
      ? ((row as any).drt_response_rows as Array<Record<string, unknown>>)
      : [];
    if (responseRows.length === 0) continue;

    const spotlightLookup = buildSpotlightLookup(row);

    for (const responseRow of responseRows) {
      const response = (responseRow.response ?? {}) as Record<string, unknown>;
      const responseTimeMs = Number(response.time ?? response.rt_ms ?? 0);
      const spotlightAtResponse = spotlightLookup.findSpotlightAtMs(responseTimeMs);
      const flat: Record<string, string | number | boolean | null> = {
        ...buildTrialCsvContext(row, blockPlan, ids),
        spotlight_brick_id: spotlightAtResponse.spotlightBrickId,
        spotlight_conveyor_id: spotlightAtResponse.spotlightConveyorId,
      };
      flattenUnknown(responseRow, "", flat);
      out.push(flat);
    }
  }

  if (out.length === 0) return out;
  const allColumns = new Set<string>();
  out.forEach((entry) => Object.keys(entry).forEach((key) => allColumns.add(key)));
  const orderedColumns = Array.from(allColumns);
  return out.map((entry) => {
    const normalized: Record<string, string | number | boolean | null> = {};
    orderedColumns.forEach((key) => {
      normalized[key] = Object.prototype.hasOwnProperty.call(entry, key) ? entry[key] : null;
    });
    return normalized;
  });
}

async function runConfiguredTrialSurveys(container: HTMLElement, trialConfig: Record<string, unknown>): Promise<SurveyRunResult[]> {
  const surveys = resolvePostTrialSurveys(trialConfig);
  if (surveys.length === 0) return [];
  return runSurveySequence(container, surveys, "bricks-survey-submit");
}

function resolvePostTrialSurveys(trialConfig: Record<string, unknown>): SurveyDefinition[] {
  const candidates = collectSurveyEntries(trialConfig, {
    arrayKey: "postTrial",
    singletonKey: "survey",
  });
  if (candidates.length > 0) {
    return parseSurveyDefinitions(candidates);
  }

  const selfReport = asObject(trialConfig.selfReport);
  if (!selfReport || selfReport.enable !== true) return [];
  const prompt = typeof selfReport.prompt === 'string' && selfReport.prompt.trim()
    ? selfReport.prompt.trim()
    : undefined;
  return [
    createAtwitSurvey({
      id: "atwit",
      prompt,
    }),
  ];
}

function withSurveyResults(trialData: ConveyorTrialData, surveys: SurveyRunResult[]): ConveyorTrialData {
  const merged = attachSurveyResults(
    trialData as unknown as Record<string, unknown>,
    surveys,
  ) as unknown as ConveyorTrialData & { surveys?: SurveyRunResult[]; self_report?: Record<string, unknown> };

  const atwitOverall = findFirstSurveyScore(surveys, "overall");
  if (atwitOverall !== null) {
    merged.self_report = { workload: atwitOverall };
  }
  return merged as ConveyorTrialData;
}

function collectSurveySummaries(row: ConveyorTrialData): { atwitOverall: number | null; nasaRawTlx: number | null } {
  const surveys = ((row as any).surveys ?? []) as SurveyRunResult[];
  return {
    atwitOverall: findFirstSurveyScore(surveys, "overall"),
    nasaRawTlx: findFirstSurveyScore(surveys, "raw_tlx"),
  };
}

function calculateExperimentMaxBrickDimensions(config: Record<string, unknown>) {
  let maxWidth = 80;
  let maxHeight = 60;

  function update(w: unknown, h: unknown) {
    const valW = typeof (w as any)?.max === 'number' ? (w as any).max : (typeof (w as any)?.value === 'number' ? (w as any).value : (typeof w === 'number' ? w : NaN));
    if (Number.isFinite(valW)) maxWidth = Math.max(maxWidth, valW);
    
    const valH = typeof (h as any)?.max === 'number' ? (h as any).max : (typeof (h as any)?.value === 'number' ? (h as any).value : (typeof h === 'number' ? h : NaN));
    if (Number.isFinite(valH)) maxHeight = Math.max(maxHeight, valH);
  }

  const display = asObject(config.display);
  if (display) {
    update(display.brickWidth, display.brickHeight);
  }

  function scanSection(section: Record<string, unknown> | null) {
    if (!section) return;
    const bricks = asObject(section.bricks);
    if (bricks) {
      const forcedSet = asArray(bricks.forcedSet);
      forcedSet.forEach((b: any) => {
        if (b && typeof b === 'object') {
          update(b.width ?? b.processingWidthPx ?? b.processing_width_px, null);
        }
      });
      const widthCategories = asArray(bricks.widthCategories);
      widthCategories.forEach((c: any) => {
        if (c && typeof c === 'object') {
          update(c.width, null);
        }
      });
    }
    const d = asObject(section.display);
    if (d) {
      update(d.brickWidth, d.brickHeight);
    }
  }

  scanSection(config);

  const blocks = asArray(config.blocks);
  blocks.forEach((b: any) => {
    const blockObj = asObject(b);
    if (blockObj) {
      scanSection(blockObj);
      scanSection(asObject(blockObj.overrides));
    }
  });

  const manipulations = asArray(config.manipulations);
  manipulations.forEach((m: any) => {
    const manipObj = asObject(m);
    if (manipObj) {
      scanSection(asObject(manipObj.overrides));
    }
  });

  return { maxWidth, maxHeight };
}
