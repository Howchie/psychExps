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
  resolveTemplatedString,
  renderCenteredNotice,
  runInstructionScreens,
  runTaskSession,
  runSurvey,
  waitForContinue,
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
} from '@experiments/core';
import { resolveBricksDrtConfig, type BricksScopedDrtConfig } from './runtime/drtConfig.js';
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
  trialConfigs: Array<Record<string, unknown>>;
}

interface ActiveBricksDrtScope {
  scopeId: string;
  config: BricksScopedDrtConfig;
  controller: DrtController;
  bindings: ConveyorTrialDrtRuntimeBindings | null;
  activeTrialIndex: number | null;
}

class BricksTaskAdapter implements TaskAdapter {
  readonly manifest: TaskAdapter["manifest"] = {
    taskId: 'bricks',
    label: 'Bricks (DiscoveryProject)',
    variants: [
      { id: 'baseline', label: 'Moray Baseline', configPath: 'bricks/baseline' },
      { id: 'moray1991', label: 'Moray 1991 VPT+VDD', configPath: 'bricks/moray1991' },
      { id: 'spotlight', label: 'Spotlight + DRT', configPath: 'bricks/spotlight' },
      { id: 'drt_block_demo', label: 'DRT Block Scope Demo', configPath: 'bricks/drt_block_demo' },
    ],
  };

  private context: TaskAdapterContext | null = null;

  async initialize(context: TaskAdapterContext): Promise<void> {
    this.context = context;
  }

  async execute(): Promise<unknown> {
    if (!this.context) throw new Error("Bricks Task not initialized");
    const result = await runBricksTask(this.context, this.context.moduleRunner);
    return result;
  }

  async terminate(): Promise<void> {}
}

export const bricksAdapter = new BricksTaskAdapter();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function resolveBricksDrtOverride(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const source = asRecord(raw);
  if (!source) return null;
  const localModules = asRecord(source.modules);
  const taskModules = asRecord(asRecord(source.task)?.modules);
  return asRecord(localModules?.drt) ?? asRecord(taskModules?.drt) ?? null;
}

function toBricksDrtScopeId(blockIndex: number, trialIndex: number | null): string {
  return `B${blockIndex}${trialIndex !== null ? `T${trialIndex}` : ""}`;
}

function toBricksDrtScopeIdFromAddress(address: TaskModuleAddress | undefined): string | null {
  if (!address) return null;
  if (address.blockIndex == null) return null;
  return toBricksDrtScopeId(address.blockIndex, address.trialIndex);
}

async function runBricksTask(context: TaskAdapterContext, runner: TaskAdapterContext["moduleRunner"]): Promise<unknown> {
  const config = context.taskConfig as JSONObject;
  const instructionSlots = resolveInstructionScreenSlots(config.instructions);

  const root = context.container;

  const rng = createMulberry32(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId));
  const blockPlan = buildBlockPlan(config, rng, context.selection);
  const records: ConveyorTrialData[] = [];
  const eventLogger = createEventLogger(context.selection);
  
  const activeDrtScopes = new Map<string, ActiveBricksDrtScope>();
  const blockDrtPreviousStats = new Map<number, Record<string, number>>();

  runner.setOptions({
    onEvent: (event) => {
      const address = (event as any).address as TaskModuleAddress | undefined;
      const scopeId = toBricksDrtScopeIdFromAddress(address);
      const active = scopeId ? activeDrtScopes.get(scopeId) : undefined;
      
      if (event.type === "bricks_drt" || event.type.startsWith("drt_")) {
        active?.bindings?.onEvent(event as unknown as Record<string, unknown>);
      }
      
      eventLogger.emit(
        event.type,
        event,
        {
          blockIndex: address?.blockIndex ?? -1,
          ...(typeof address?.trialIndex === "number" ? { trialIndex: address.trialIndex } : {}),
        },
      );
    }
  });

  const toConveyorDrtRuntime = (scopeId: string, trialIndex: number | null): ConveyorTrialDrtRuntime | null => {
    const active = activeDrtScopes.get(scopeId);
    if (!active) return null;
    return {
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
  };

  const startDrtScope = (drtConfig: BricksScopedDrtConfig, scope: "block" | "trial", blockIndex: number, trialIndex: number | null): string => {
    const scopeId = toBricksDrtScopeId(blockIndex, trialIndex);
    const activeScope: ActiveBricksDrtScope = {
      scopeId,
      config: drtConfig,
      controller: null as unknown as DrtController,
      bindings: null,
      activeTrialIndex: trialIndex,
    };
    
    startDrtModuleScope({
      runner,
      drtConfig,
      scope,
      blockIndex,
      trialIndex,
      participantId: context.selection.participant.participantId,
      sessionId: context.selection.participant.sessionId,
      variantId: context.selection.variantId,
      taskSeedKey: "bricks_drt",
      seedSuffix: scopeId,
      onControllerCreated: (controller) => {
        activeScope.controller = controller;
      },
      context: {
        displayElement: root,
        borderTargetElement: root,
        borderTargetRect: () => activeScope.bindings?.displayElement?.getBoundingClientRect() ?? null,
      },
    });
    
    activeDrtScopes.set(scopeId, activeScope);
    return scopeId;
  };

  eventLogger.emit('task_start', { task: 'bricks' });

  await waitForContinue(
    root,
    `<h2>${escapeHtml(String(((config as any).task as any)?.title ?? 'Bricks Task'))}</h2><p>Participant: <code>${escapeHtml(context.selection.participant.participantId)}</code></p>`,
    { buttonId: "bricks-continue-btn-start" },
  );
  const introInstructionPages = resolveInstructionPagesForContext({
    pages: instructionSlots.intro,
    templateVars: config,
    resolver: context.resolver,
  });
  if (introInstructionPages.length > 0) {
    await runInstructionScreens({
      container: root,
      section: "intro",
      pages: introInstructionPages.map((entry) => entry.text ?? entry.html ?? ""),
      buttonIdPrefix: "bricks-instructions-intro",
      ...(typeof ((config as any).task as any)?.title === "string" ? { title: String(((config as any).task as any).title) } : {}),
      renderHtml: (ctx) => renderBricksInstructionPage(introInstructionPages[ctx.pageIndex] ?? {}, ctx.pageText),
    });
  }

  await runTaskSession<BlockPlanItem, Record<string, unknown>, ConveyorTrialData>({
    blocks: blockPlan,
    getTrials: ({ block }) => block.trialConfigs,
    runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
      const resolvedDrtConfig = resolveBricksDrtConfig(resolveBricksDrtOverride(trial));
      let trialScopeAddress: { scope: "trial"; blockIndex: number; trialIndex: number } | null = null;
      let injectedDrtRuntime: ConveyorTrialDrtRuntime | undefined;
      
      if (resolvedDrtConfig.enabled) {
        if (resolvedDrtConfig.scope === "trial") {
          trialScopeAddress = { scope: "trial", blockIndex, trialIndex };
          const scopeId = startDrtScope(resolvedDrtConfig, "trial", blockIndex, trialIndex);
          injectedDrtRuntime = toConveyorDrtRuntime(scopeId, trialIndex) ?? undefined;
        } else {
          const blockScopeId = toBricksDrtScopeId(blockIndex, null);
          if (activeDrtScopes.has(blockScopeId)) {
            injectedDrtRuntime = toConveyorDrtRuntime(blockScopeId, trialIndex) ?? undefined;
          }
        }
      }
      
      const stageHost = document.createElement('div');
      stageHost.style.width = '100%';
      stageHost.style.minHeight = '70vh';
      stageHost.style.display = 'flex';
      stageHost.style.justifyContent = 'center';
      stageHost.style.alignItems = 'center';
      root.innerHTML = '';
      root.appendChild(stageHost);
      
      let record: ConveyorTrialData;
      try {
        record = await runConveyorTrial({
          displayElement: stageHost,
          blockLabel: block.label,
          blockIndex: block.index,
          trialIndex,
          config: trial,
          drtRuntime: injectedDrtRuntime,
        });
      } finally {
        if (trialScopeAddress) {
          const stopped = stopModuleScope({
            runner,
            scope: trialScopeAddress.scope,
            blockIndex: trialScopeAddress.blockIndex,
            trialIndex: trialScopeAddress.trialIndex,
          });
          if (stopped) {
            const scopeId = toBricksDrtScopeId(blockIndex, trialIndex);
            activeDrtScopes.delete(scopeId);
            const snapshot = stopped.data; // TaskModuleRunner results.data is the DrtData
            record = {
              ...record!,
              drt: snapshot,
              drt_transforms: (stopped as any).transforms,
              drt_response_rows: (stopped as any).responseRows,
            } as ConveyorTrialData;
          }
        }
      }
      
      if (resolvedDrtConfig.enabled && resolvedDrtConfig.scope === "block") {
        const previousStats = blockDrtPreviousStats.get(blockIndex) ?? {};
        const currentStats = extractNumericStats(((record as any).drt?.stats ?? {}) as Record<string, unknown>);
        const deltaStats = subtractStats(currentStats, previousStats);
        (record as any).drt_cumulative = (record as any).drt;
        (record as any).drt = {
          ...((record as any).drt ?? {}),
          stats: deltaStats,
        };
        blockDrtPreviousStats.set(blockIndex, currentStats);
      }
      const surveyResults = await runConfiguredTrialSurveys(root, trial);
      record = withSurveyResults(record, surveyResults);
      records.push(record);
      eventLogger.emit(
        'trial_complete',
        {
          endReason: record.end_reason,
          trialDurationMs: record.trial_duration_ms,
          game: (record as any).game?.stats ?? {},
          drt: (record as any).drt?.stats ?? {},
          surveys: surveyResults.map((entry) => ({
            surveyId: entry.surveyId,
            scores: entry.scores ?? {},
          })),
        },
        { blockIndex, trialIndex },
      );
      return record;
    },
    hooks: {
      onBlockStart: async ({ block, blockIndex }) => {
        eventLogger.emit('block_start', { label: block.label, manipulationId: block.manipulationId }, { blockIndex });
        const scopedInstructionVars = {
          ...config,
          block: {
            label: block.label,
            index: block.index,
            trials: block.trials,
            manipulationId: block.manipulationId,
          },
        };
        const preBlockPages = resolveInstructionPagesForContext({
          pages: instructionSlots.preBlock,
          templateVars: scopedInstructionVars,
          resolver: context.resolver,
          blockIndex,
        });
        if (preBlockPages.length > 0) {
          await runInstructionScreens({
            container: root,
            section: "preBlock",
            pages: preBlockPages.map((entry) => entry.text ?? entry.html ?? ""),
            blockLabel: block.label,
            buttonIdPrefix: `bricks-instructions-block-${block.index}`,
            renderHtml: (ctx) => renderBricksInstructionPage(preBlockPages[ctx.pageIndex] ?? {}, ctx.pageText),
          });
        }
        await waitForContinue(
          root,
          `<h3>${escapeHtml(block.label)}</h3><p>Manipulation: <code>${escapeHtml(block.manipulationId ?? 'none')}</code></p><p>Trials: ${block.trials}</p>`,
          { buttonId: `bricks-continue-btn-block-${block.index}` },
        );
        const blockScopedDrt = resolveBlockScopedDrtConfig(block.trialConfigs);
        if (blockScopedDrt && blockScopedDrt.enabled && blockScopedDrt.scope === "block") {
          startDrtScope(blockScopedDrt, "block", blockIndex, null);
          blockDrtPreviousStats.delete(blockIndex);
        }
      },
      onBlockEnd: async ({ block, blockIndex, trialResults }) => {
        stopModuleScope({ runner, scope: "block", blockIndex, trialIndex: null });
        const scopeId = toBricksDrtScopeId(blockIndex, null);
        activeDrtScopes.delete(scopeId);
        
        blockDrtPreviousStats.delete(blockIndex);
        const totals = summarizeBlockTrials(trialResults);
        eventLogger.emit('block_end', { label: block.label, totals }, { blockIndex });
        const showDrtSummary = blockHasEnabledDrt(trialResults);
        const drtSummary = showDrtSummary
          ? `<li>DRT hits: ${totals.hits}</li><li>DRT misses: ${totals.misses}</li>`
          : '';
        await waitForContinue(
          root,
          `<h3>End of ${escapeHtml(block.label)}</h3><ul><li>Bricks cleared: ${totals.cleared}</li><li>Bricks dropped: ${totals.dropped}</li>${drtSummary}</ul>`,
          { buttonId: `bricks-continue-btn-end-${block.index}` },
        );
        const scopedInstructionVars = {
          ...config,
          block: {
            label: block.label,
            index: block.index,
            trials: block.trials,
            manipulationId: block.manipulationId,
          },
        };
        const postBlockPages = resolveInstructionPagesForContext({
          pages: instructionSlots.postBlock,
          templateVars: scopedInstructionVars,
          resolver: context.resolver,
          blockIndex,
        });
        if (postBlockPages.length > 0) {
          await runInstructionScreens({
            container: root,
            section: "postBlock",
            pages: postBlockPages.map((entry) => entry.text ?? entry.html ?? ""),
            blockLabel: block.label,
            buttonIdPrefix: `bricks-instructions-block-${block.index}`,
            renderHtml: (ctx) => renderBricksInstructionPage(postBlockPages[ctx.pageIndex] ?? {}, ctx.pageText),
          });
        }
      },
    },
  });

  const endInstructionPages = resolveInstructionPagesForContext({
    pages: instructionSlots.end,
    templateVars: config,
    resolver: context.resolver,
  });
  if (endInstructionPages.length > 0) {
    await runInstructionScreens({
      container: root,
      section: "end",
      pages: endInstructionPages.map((entry) => entry.text ?? entry.html ?? ""),
      title: "Bricks complete",
      buttonIdPrefix: "bricks-instructions-end",
      renderHtml: (ctx) => renderBricksInstructionPage(endInstructionPages[ctx.pageIndex] ?? {}, ctx.pageText),
    });
  }

  eventLogger.emit('task_complete', { task: 'bricks', nTrials: records.length });
  
  const payload = { 
    selection: context.selection, 
    records, 
    events: eventLogger.events, 
    drtScopes: runner.getResults().map((res: any) => ({
      address: res.address ?? { scope: res.scope, blockIndex: res.blockIndex, trialIndex: res.trialIndex },
      data: res.data,
      transforms: res.data?.transforms,
      responseRows: res.data?.responseRows,
    }))
  };
  
  await finalizeTaskRun({
    coreConfig: context.coreConfig,
    selection: context.selection,
    payload,
    csv: { contents: toCsv(buildBricksCsvRows(records)), suffix: "bricks" },
    completionStatus: "complete",
  });
  root.innerHTML = renderCenteredNotice({
    title: "Bricks complete",
    message: "Data saved locally.",
  });
  
  return payload;
}

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

function buildBricksCsvRows(rows: ConveyorTrialData[]): Array<Record<string, string | number>> {
  return rows.map((row) => {
    const gameStats = ((row.game as any)?.stats ?? {}) as Record<string, unknown>;
    const drtStats = ((row.drt as any)?.stats ?? {}) as Record<string, unknown>;
    const surveySummaries = collectSurveySummaries(row);
    return {
      block_label: row.block_label,
      block_index: row.block_index,
      trial_index: row.trial_index,
      trial_duration_ms: row.trial_duration_ms,
      end_reason: row.end_reason,
      cleared: Number(gameStats.cleared ?? 0),
      dropped: Number(gameStats.dropped ?? 0),
      spawned: Number(gameStats.spawned ?? 0),
      drt_hits: Number(drtStats.hits ?? 0),
      drt_misses: Number(drtStats.misses ?? 0),
      atwit_overall: surveySummaries.atwitOverall ?? '',
      nasa_raw_tlx: surveySummaries.nasaRawTlx ?? '',
    };
  });
}

function runConfiguredTrialSurveys(container: HTMLElement, trialConfig: Record<string, unknown>): Promise<SurveyRunResult[]> {
  const surveys = resolvePostTrialSurveys(trialConfig);
  if (surveys.length === 0) return Promise.resolve([]);
  return surveys.reduce<Promise<SurveyRunResult[]>>(
    async (pending, survey, index) => {
      const acc = await pending;
      const result = await runSurvey(container, survey, {
        buttonId: `bricks-survey-submit-${index + 1}`,
      });
      acc.push(result);
      return acc;
    },
    Promise.resolve([]),
  );
}

function resolvePostTrialSurveys(trialConfig: Record<string, unknown>): SurveyDefinition[] {
  const candidates = collectModernSurveyCandidates(trialConfig);
  if (candidates.length > 0) {
    return candidates
      .map((entry, index) => toSurveyDefinition(entry, index))
      .filter((entry): entry is SurveyDefinition => Boolean(entry));
  }

  const selfReport = trialConfig.selfReport;
  if (!isRecord(selfReport) || selfReport.enable !== true) return [];
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
  } else if (isRecord(surveysNode)) {
    if (Array.isArray(surveysNode.postTrial)) output.push(...surveysNode.postTrial);
  }
  const singleSurvey = trialConfig.survey;
  if (singleSurvey !== undefined && singleSurvey !== null) {
    output.unshift(singleSurvey);
  }
  return output;
}

function toSurveyDefinition(entry: unknown, index: number): SurveyDefinition | null {
  if (!isRecord(entry)) return null;
  if (isSurveyDefinitionLike(entry)) {
    const normalizedId = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `survey_${index + 1}`;
    const questions = Array.isArray(entry.questions) ? (entry.questions as SurveyDefinition["questions"]) : [];
    if (questions.length === 0) return null;
    return {
      id: normalizedId,
      title: typeof entry.title === 'string' ? entry.title : undefined,
      description: typeof entry.description === 'string' ? entry.description : undefined,
      showQuestionNumbers: typeof entry.showQuestionNumbers === 'boolean' ? entry.showQuestionNumbers : undefined,
      showRequiredAsterisk: typeof entry.showRequiredAsterisk === 'boolean' ? entry.showRequiredAsterisk : undefined,
      questions,
      submitLabel: typeof entry.submitLabel === 'string' ? entry.submitLabel : undefined,
      computeScores:
        typeof entry.computeScores === 'function'
          ? (entry.computeScores as SurveyDefinition["computeScores"])
          : undefined,
    };
  }
  const preset = entry.preset;
  if (preset === "atwit" || preset === "nasa_tlx") {
    return createSurveyFromPreset(entry as SurveyPresetSpec);
  }
  return null;
}

function isSurveyDefinitionLike(entry: Record<string, unknown>): boolean {
  return Array.isArray(entry.questions);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      const title = entry.title
        ? resolveTemplatedString({
            template: entry.title,
            vars: args.templateVars,
            resolver: args.resolver,
            ...(typeof args.blockIndex === "number" ? { context: { blockIndex: args.blockIndex } } : {}),
          }).trim()
        : "";
      const text = entry.text
        ? resolveTemplatedString({
            template: entry.text,
            vars: args.templateVars,
            resolver: args.resolver,
            ...(typeof args.blockIndex === "number" ? { context: { blockIndex: args.blockIndex } } : {}),
          })
        : "";
      const html = entry.html
        ? resolveTemplatedString({
            template: entry.html,
            vars: args.templateVars,
            resolver: args.resolver,
            ...(typeof args.blockIndex === "number" ? { context: { blockIndex: args.blockIndex } } : {}),
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
