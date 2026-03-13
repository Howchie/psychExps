import {
  buildScheduledItems,
  createAtwitSurvey,
  createMulberry32,
  createSurveyFromPreset,
  DrtController,
  createEventLogger,
  deepClone,
  deepMerge,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  escapeHtml,
  finalizeTaskRun,
  hashSeed,
  recordsToCsv as toCsv,
  resolveInstructionScreenSlots,
  resolveButtonStyleOverrides,
  resolveTemplatedString,
  runInstructionScreens,
  runTaskSession,
  runSurvey,
  isStimulusExportOnly,
  exportStimulusRows,
  asObject,
  asArray,
  asString,
  type InstructionScreenSpec,
  type JSONObject,
  type SelectionContext,
  type SurveyDefinition,
  type SurveyPresetSpec,
  type SurveyRunResult,
  type TaskAdapter,
  type TaskAdapterContext,
  type TaskModuleAddress,
  startDrtModuleScope,
  stopModuleScope,
  TaskOrchestrator,
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
  scopeId: string;
  config: BricksScopedDrtConfig;
  controller: DrtController;
  bindings: ConveyorTrialDrtRuntimeBindings | null;
  activeTrialIndex: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toBricksDrtScopeId(blockIndex: number, trialIndex: number | null): string {
  return `B${blockIndex}${trialIndex !== null ? `T${trialIndex}` : ""}`;
}

function resolveBricksDrtOverride(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const source = asRecord(raw);
  if (!source) return null;
  const localModules = asRecord(source.modules);
  const taskModules = asRecord(asRecord(source.task)?.modules);
  return asRecord(localModules?.drt) ?? asRecord(taskModules?.drt) ?? null;
}

class BricksTaskAdapter implements TaskAdapter {
  readonly manifest: TaskAdapter["manifest"] = {
    taskId: 'bricks',
    label: 'Bricks (DiscoveryProject)',
    variants: [
      { id: 'baseline', label: 'Moray Baseline', configPath: 'bricks/baseline' },
      { id: 'moray1991', label: 'Moray 1991 VPT+VDD', configPath: 'bricks/moray1991' },
      { id: 'spotlight', label: 'Spotlight + DRT', configPath: 'bricks/spotlight' },
      { id: 'evanderHons', label: 'Evander Honours', configPath: 'bricks/evanderHons' },
      { id: 'evanderHonsNoSpotlight', label: 'Evander Honours No SPotlight', configPath: 'bricks/evanderHonsNoSpotlight' },
      { id: 'drt_block_demo', label: 'DRT Block Scope Demo', configPath: 'bricks/drt_block_demo' },
    ],
  };

  private context: TaskAdapterContext | null = null;

  async initialize(context: TaskAdapterContext): Promise<void> {
    this.context = context;
  }

  async execute(): Promise<unknown> {
    if (!this.context) throw new Error("Bricks Task not initialized");
    const { context } = this;
    const { taskConfig, rawTaskConfig, selection, resolver, container, moduleRunner } = context;
    const rawTaskNode = asRecord(rawTaskConfig.task);
    const rawTaskModules = asRecord(rawTaskNode?.modules);
    const rawTaskDrt = asRecord(rawTaskModules?.drt);
    const rawTaskDrtEnabledBefore = rawTaskDrt ? rawTaskDrt.enabled : undefined;
    if (rawTaskDrt) {
      // Bricks manages DRT scopes manually via startDrtModuleScope; prevent orchestrator auto-start duplication.
      rawTaskDrt.enabled = false;
    }

    const rng = createMulberry32(hashSeed(selection.participant.participantId, selection.participant.sessionId, selection.variantId));
    const blockPlan = buildBlockPlan(taskConfig as Record<string, unknown>, rng, selection);
    const instructionSlots = resolveInstructionScreenSlots((taskConfig as Record<string, unknown>).instructions);
    const statsPresentation = resolveBricksStatsPresentation(taskConfig);
    const statsAccumulator = createBricksStatsAccumulator();

    if (isStimulusExportOnly(taskConfig)) {
      return exportStimulusRows({
        context,
        rows: buildBricksStimulusRows(blockPlan),
        suffix: "bricks_stimulus_list",
      });
    }

    const eventLogger = createEventLogger(selection);
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

    try {
      return await orchestrator.run({
        buttonIdPrefix: "bricks",
        introPages: instructionSlots.intro,
        endPages: instructionSlots.end,
        getBlocks: () => blockPlan,
        getTrials: ({ block }) => block.trialConfigs,
        getEvents: () => eventLogger.events,
        onTaskStart: () => {
          eventLogger.emit("task_start", { task: "bricks" });
        },
        renderInstruction: (ctx) => {
          const sectionPages = instructionSlots[ctx.section as keyof typeof instructionSlots] ?? [];
          const pageSpec = sectionPages[ctx.pageIndex];
          if (!pageSpec) return ctx.pageHtml ?? ctx.pageText;

          const resolved = resolveInstructionPagesForContext({
            pages: [pageSpec as any],
            templateVars: taskConfig as Record<string, unknown>,
            resolver,
            blockIndex: ctx.blockLabel ? blockPlan.findIndex((b) => b.label === ctx.blockLabel) : undefined,
          })[0];

          return renderBricksInstructionPage(resolved || {}, ctx.pageText);
        },
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

        const blockScopedDrt = resolveBlockScopedDrtConfig(block.trialConfigs);
        if (blockScopedDrt && blockScopedDrt.enabled && blockScopedDrt.scope === "block") {
          const scopeId = toBricksDrtScopeId(blockIndex, null);
          const activeScope: ActiveBricksDrtScope = {
            scopeId,
            config: blockScopedDrt,
            controller: null as unknown as DrtController,
            bindings: null,
            activeTrialIndex: null,
          };
          
          startDrtModuleScope({
            runner: moduleRunner,
            drtConfig: blockScopedDrt,
            scope: "block",
            blockIndex,
            trialIndex: null,
            participantId: selection.participant.participantId,
            sessionId: selection.participant.sessionId,
            variantId: selection.variantId,
            taskSeedKey: "bricks_drt",
            seedSuffix: scopeId,
            onControllerCreated: (controller) => { activeScope.controller = controller; },
            context: {
              displayElement: container,
              borderTargetElement: undefined,
              borderTargetRect: () => activeScope.bindings?.displayElement?.getBoundingClientRect() ?? null,
            },
          });
          activeDrtScopes.set(scopeId, activeScope);
        }
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

        const resolvedDrtConfig = resolveBricksDrtConfig(resolveBricksDrtOverride(trial));
        let injectedDrtRuntime: ConveyorTrialDrtRuntime | undefined;
        const scopeId = toBricksDrtScopeId(blockIndex, resolvedDrtConfig.scope === "trial" ? trialIndex : null);

        if (resolvedDrtConfig.enabled) {
          
          if (resolvedDrtConfig.scope === "trial") {
            const activeScope: ActiveBricksDrtScope = {
              scopeId,
              config: resolvedDrtConfig,
              controller: null as unknown as DrtController,
              bindings: null,
              activeTrialIndex: trialIndex,
            };
            startDrtModuleScope({
              runner: moduleRunner,
              drtConfig: resolvedDrtConfig,
              scope: "trial",
              blockIndex,
              trialIndex,
              participantId: selection.participant.participantId,
              sessionId: selection.participant.sessionId,
              variantId: selection.variantId,
              taskSeedKey: "bricks_drt",
              seedSuffix: scopeId,
              onControllerCreated: (controller) => { activeScope.controller = controller; },
              context: {
                displayElement: stageHost,
                borderTargetElement: undefined,
                borderTargetRect: () => activeScope.bindings?.displayElement?.getBoundingClientRect() ?? null,
              },
            });
            activeDrtScopes.set(scopeId, activeScope);
          }

          const active = activeDrtScopes.get(scopeId);
          if (active) {
            injectedDrtRuntime = {
              config: active.config,
              controller: active.controller,
              stopOnCleanup: false,
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
        }

        let record = await runConveyorTrial({
          displayElement: stageHost,
          blockLabel: block.label,
          blockIndex: block.index,
          trialIndex,
          config: trial,
          drtRuntime: injectedDrtRuntime,
          hudBaseStats: buildHudBaseStats(statsAccumulator, statsPresentation),
        });

        // Handle DRT results if trial-scoped
        if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "trial") {
          const trialScopeResults = moduleRunner.stopScopedModules({
            scope: "trial",
            blockIndex,
            trialIndex,
          });
          const trialResult = trialScopeResults.find((r) => r.moduleId === "drt");
          if (trialResult) {
            const responseRows = ((trialResult as any).responseRows ?? []) as Array<Record<string, unknown>>;
            const latestEstimate = responseRows
              .slice()
              .reverse()
              .map((row) => row.estimate as Record<string, unknown> | null | undefined)
              .find((estimate) => Boolean(estimate)) ?? null;
            record = {
              ...record,
              drt: {
                ...(trialResult.data ?? {}),
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
          suffix: "bricks_drt_rows",
          getRecords: (res) => buildBricksDrtRows(
            res.blocks.flatMap((b: any) => b.trialResults),
            blockPlan,
            {
              participantId: selection.participant.participantId,
              variantId: selection.variantId,
            },
          ),
        },
        getTaskMetadata: (res) => ({
          drt_rows: buildBricksDrtRows(
            res.blocks.flatMap((b: any) => b.trialResults),
            blockPlan,
            {
              participantId: selection.participant.participantId,
              variantId: selection.variantId,
            },
          ),
        }),
      });
    } finally {
      if (rawTaskDrt) {
        rawTaskDrt.enabled = rawTaskDrtEnabledBefore;
      }
    }
  }

  async terminate(): Promise<void> {}
}

export const bricksAdapter = new BricksTaskAdapter();

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
    const phase = typeof block.phase === 'string' && block.phase.trim().length > 0 ? block.phase.trim() : null;
    const isPractice =
      typeof block.isPractice === 'boolean'
        ? block.isPractice
        : (typeof phase === 'string' && phase.toLowerCase().includes('practice'));
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

    return {
      ...block,
      index,
      label,
      trials,
      manipulationId,
      phase,
      isPractice,
      trialConfigs,
    };
  });
}

function buildBricksStimulusRows(
  blockPlan: BlockPlanItem[],
): Array<Record<string, string | number | boolean | null>> {
  return blockPlan.flatMap((block) =>
    block.trialConfigs.map((trialConfig, trialIndex) => {
      const trialNode = asRecord(trialConfig.trial);
      const drt = resolveBricksDrtConfig(resolveBricksDrtOverride(trialConfig));
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
    .map((trialConfig) => resolveBricksDrtConfig(resolveBricksDrtOverride(trialConfig)))
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

function buildBricksDrtRows(
  rows: ConveyorTrialData[],
  blockPlan: BlockPlanItem[],
  ids: { participantId: string; variantId: string },
): Array<Record<string, string | number | boolean | null>> {
  const out: Array<Record<string, string | number | boolean | null>> = [];

  for (const row of rows) {
    const responseRows = Array.isArray((row as any).drt_response_rows)
      ? ((row as any).drt_response_rows as Array<Record<string, unknown>>)
      : [];
    if (responseRows.length === 0) continue;

    const blockMeta = blockPlan[row.block_index];
    const spotlightLookup = buildSpotlightLookup(row);

    for (const responseRow of responseRows) {
      const response = (responseRow.response ?? {}) as Record<string, unknown>;
      const responseTimeMs = Number(response.time ?? response.rt_ms ?? 0);
      const spotlightAtResponse = spotlightLookup.findSpotlightAtMs(responseTimeMs);
      const flat: Record<string, string | number | boolean | null> = {
        participant_id: ids.participantId,
        variant_id: ids.variantId,
        bricks_trial_id: `B${row.block_index}_T${row.trial_index}`,
        block_index: row.block_index,
        block_label: row.block_label,
        block_phase: blockMeta?.phase ?? null,
        block_is_practice: blockMeta?.isPractice ?? null,
        manipulation_id: blockMeta?.manipulationId ?? null,
        trial_index: row.trial_index,
        trial_duration_ms: row.trial_duration_ms,
        trial_end_reason: row.end_reason,
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
  const results: SurveyRunResult[] = [];
  for (let i = 0; i < surveys.length; i++) {
    const result = await runSurvey(container, surveys[i], {
      buttonId: `bricks-survey-submit-${i + 1}`,
    });
    results.push(result);
  }
  return results;
}

function resolvePostTrialSurveys(trialConfig: Record<string, unknown>): SurveyDefinition[] {
  const candidates = collectModernSurveyCandidates(trialConfig);
  if (candidates.length > 0) {
    return candidates
      .map((entry, index) => toSurveyDefinition(entry, index))
      .filter((entry): entry is SurveyDefinition => Boolean(entry));
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

function collectModernSurveyCandidates(trialConfig: Record<string, unknown>): unknown[] {
  const output: unknown[] = [];
  const surveysNode = trialConfig.surveys;
  if (Array.isArray(surveysNode)) {
    output.push(...surveysNode);
  } else if (asObject(surveysNode)) {
    const postTrial = asArray((surveysNode as any).postTrial);
    if (postTrial.length > 0) output.push(...postTrial);
  }
  const singleSurvey = trialConfig.survey;
  if (singleSurvey !== undefined && singleSurvey !== null) {
    output.unshift(singleSurvey);
  }
  return output;
}

function toSurveyDefinition(entry: unknown, index: number): SurveyDefinition | null {
  const obj = asObject(entry);
  if (!obj) return null;
  if (Array.isArray(obj.questions)) {
    const normalizedId = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `survey_${index + 1}`;
    return {
      id: normalizedId,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      showQuestionNumbers: typeof obj.showQuestionNumbers === 'boolean' ? obj.showQuestionNumbers : undefined,
      showRequiredAsterisk: typeof obj.showRequiredAsterisk === 'boolean' ? obj.showRequiredAsterisk : undefined,
      submitButtonStyle: resolveButtonStyleOverrides(obj.submitButtonStyle),
      autoFocusSubmitButton: typeof obj.autoFocusSubmitButton === 'boolean' ? obj.autoFocusSubmitButton : undefined,
      questions: obj.questions as SurveyDefinition["questions"],
      submitLabel: typeof obj.submitLabel === 'string' ? obj.submitLabel : undefined,
      computeScores:
        typeof obj.computeScores === 'function'
          ? (obj.computeScores as SurveyDefinition["computeScores"])
          : undefined,
    };
  }
  const preset = obj.preset;
  if (preset === "atwit" || preset === "nasa_tlx") {
    return createSurveyFromPreset(obj as SurveyPresetSpec);
  }
  return null;
}

interface BricksInstructionPage {
  title?: string;
  text?: string;
  html?: string;
}

function resolveInstructionPagesForContext(args: {
  pages: InstructionScreenSpec[];
  templateVars: Record<string, unknown>;
  resolver: TaskAdapterContext["resolver"];
  blockIndex?: number;
}): BricksInstructionPage[] {
  return args.pages
    .map((entry) => {
      const context = typeof args.blockIndex === "number" ? { blockIndex: args.blockIndex } : undefined;
      const title = entry.title
        ? resolveTemplatedString({
            template: entry.title,
            vars: args.templateVars,
            resolver: args.resolver,
            context,
          }).trim()
        : "";
      const text = entry.text
        ? resolveTemplatedString({
            template: entry.text,
            vars: args.templateVars,
            resolver: args.resolver,
            context,
          })
        : "";
      const html = entry.html
        ? resolveTemplatedString({
            template: entry.html,
            vars: args.templateVars,
            resolver: args.resolver,
            context,
          })
        : "";
      return {
        ...(title ? { title } : {}),
        ...(text ? { text } : {}),
        ...(html ? { html } : {}),
      };
    })
    .filter((entry) => Boolean(entry.text || entry.html));
}

function renderBricksInstructionPage(page: BricksInstructionPage, fallbackText: string): string {
  const heading = page.title || null;
  const headingHtml = heading ? `<h3>${escapeHtml(heading)}</h3>` : "";
  const bodyHtml = page.html ?? `<p>${escapeHtml(page.text ?? fallbackText)}</p>`;
  return `${headingHtml}${bodyHtml}`;
}

function withSurveyResults(trialData: ConveyorTrialData, surveys: SurveyRunResult[]): ConveyorTrialData {
  if (surveys.length === 0) return trialData;
  const next = {
    ...trialData,
    surveys,
  } as ConveyorTrialData & { surveys: SurveyRunResult[]; self_report?: Record<string, unknown> };

  const atwitOverall = surveys
    .map((entry) => entry.scores?.overall)
    .find((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (atwitOverall !== undefined) {
    next.self_report = { workload: atwitOverall };
  }
  return next;
}

function collectSurveySummaries(row: ConveyorTrialData): { atwitOverall: number | null; nasaRawTlx: number | null } {
  const surveys = ((row as any).surveys ?? []) as SurveyRunResult[];
  if (!Array.isArray(surveys) || surveys.length === 0) {
    return { atwitOverall: null, nasaRawTlx: null };
  }
  const atwitOverall = surveys
    .map((entry) => entry.scores?.overall)
    .find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null;
  const nasaRawTlx = surveys
    .map((entry) => entry.scores?.raw_tlx)
    .find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null;
  return { atwitOverall, nasaRawTlx };
}
