import {
  SeededRandom,
  DrtController,
  OnlineParameterTransformRunner,
  createEventLogger,
  drawTrialFeedbackOnCanvas,
  escapeHtml,
  evaluateTrialOutcome,
  finalizeTaskRun,
  hashSeed,
  normalizeKey,
  computeCanvasFrameLayout,
  drawCanvasFramedScene,
  drawCanvasCenteredText,
  ensureJsPsychCanvasCentered,
  installKeyScrollBlocker,
  pushJsPsychContinueScreen,
  resolveJsPsychContentHost,
  resolveTrialFeedbackView,
  runJsPsychTimeline,
  renderCenteredNotice,
  recordsToCsv,
  setCursorHidden,
  toJsPsychChoices,
  waitForContinue,
  resolveTemplate,
  createResponseSemantics,
  computeRtPhaseDurations,
  appendJsPsychContinuePages,
  coerceCsvStimulusConfig,
  coerceCategoryDrawConfig,
  coercePoolDrawConfig,
  collectPoolCandidates,
  createCategoryPoolDrawer,
  createPoolDrawer,
  loadCategorizedStimulusPools,
  loadImageIfLikelyVisualStimulus,
  resolveAssetPath,
  createManipulationOverrideMap,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  applyManipulationOverridesToBlock,
  TaskModuleRunner,
  coerceScopedDrtConfig,
  resolveInstructionFlowPages,
  runTaskSession,
  asObject,
  asArray,
  asString,
  asStringArray,
  asPositiveNumberArray,
  toStringScreens,
  toPositiveNumber,
  toNonNegativeNumber,
  generateProspectiveMemoryPositions,
  parseTrialFeedbackConfig,
  type TrialFeedbackConfig,
  type RtTiming,
  type DrtEvent,
  type DrtControllerConfig,
  type JSONObject,
  type TaskAdapter,
  type TaskAdapterContext,
  type VariableResolver,
  type ResponseSemantics,
  type CsvStimulusConfig,
  type PoolDrawConfig,
  type CategoryDrawConfig,
  type ProspectiveMemoryCueRule,
  type TaskModuleAddress,
} from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";

class NbackTaskAdapter implements TaskAdapter {
  readonly manifest: TaskAdapter["manifest"] = {
    taskId: "nback",
    label: "NBack",
    variants: [
      { id: "default", label: "NBack Default", configPath: "nback/default" },
      { id: "drt_block_demo", label: "NBack DRT Block Demo", configPath: "nback/drt_block_demo" },
      { id: "pm_module_demo", label: "NBack PM Module Demo", configPath: "nback/pm_module_demo" },
    ],
  };

  private context: TaskAdapterContext | null = null;
  private runtime: NbackRuntimeState | null = null;
  private removeKeyScrollBlocker: (() => void) | null = null;

  async initialize(context: TaskAdapterContext): Promise<void> {
    this.context = context;
    this.runtime = await prepareNbackRuntime(context);
  }

  async execute(): Promise<unknown> {
    if (!this.context || !this.runtime) {
      throw new Error("NBack Task not initialized");
    }
    const result = await runNbackJsPsychTask(this.context, this.runtime);
    return result;
  }

  async terminate(): Promise<void> {
    setCursorHidden(false);
    if (this.removeKeyScrollBlocker) {
      this.removeKeyScrollBlocker();
      this.removeKeyScrollBlocker = null;
    }
  }

  setKeyScrollRemover(remover: () => void) {
    this.removeKeyScrollBlocker = remover;
  }
}

export const nbackAdapter = new NbackTaskAdapter();

function shouldHideCursorForPhase(phase: unknown): boolean {
  if (typeof phase !== "string") return false;
  return /(fixation|blank|stimulus|response|feedback)/.test(phase.toLowerCase());
}

function parseOptionalResponseKey(value: unknown): string | null {
  const parsed = asString(value);
  if (!parsed) return null;
  const normalized = normalizeKey(parsed);
  if (!normalized) return null;
  if (normalized === "none" || normalized === "null" || normalized === "no_response" || normalized === "withhold") {
    return null;
  }
  return normalized;
}

function resolveNbackDrtConfig(
  base: NbackDrtConfig,
  overrideRaw: Record<string, unknown> | null,
): NbackDrtConfig {
  return coerceScopedDrtConfig(base, overrideRaw);
}

interface NbackMapping {
  targetKey: string;
  nonTargetKey: string | null;
  pmKey: string | null;
}

type NbackDrtConfig = DrtControllerConfig & {
  enabled: boolean;
  scope: "block" | "trial";
  key: string;
  responseWindowMs: number;
  displayDurationMs: number;
  responseTerminatesStimulus: boolean;
  isiSampler: unknown;
  transformPersistence: "scope" | "session";
};

interface NbackTiming {
  trialDurationMs: number;
  fixationDurationMs: number;
  stimulusOnsetMs: number;
  responseWindowStartMs: number;
  responseWindowEndMs: number;
}

interface NbackBlockConfig {
  label: string;
  isPractice: boolean;
  nLevel: number;
  trials: number;
  blockType: "PM" | "Control";
  activePmCategories: string[];
  controlSourceCategories: string[];
  pmCount: number;
  minPmSeparation: number;
  maxPmSeparation: number;
  nbackSourceCategories: string[];
  targetCount: number;
  lureCount: number;
  stimulusVariant: number | null;
  feedback: TrialFeedbackConfig;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  drt: NbackDrtConfig;
}

interface NbackRuleConfig {
  lureLagPasses: number[][];
  maxInsertionAttempts: number;
}

interface PlannedTrial {
  trialIndex: number;
  trialType: string;
  item: string;
  sourceCategory: string;
  itemCategory: "other" | "PM" | "Control";
  correctResponse: string;
  usedAsSource?: boolean;
}

interface PlannedBlock {
  blockIndex: number;
  label: string;
  blockType: "PM" | "Control";
  isPractice: boolean;
  nLevel: number;
  stimulusVariant: number | null;
  activePmCategories: string[];
  trials: PlannedTrial[];
  feedback: TrialFeedbackConfig;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  drt: NbackDrtConfig;
}

interface ParsedNbackConfig {
  title: string;
  mapping: NbackMapping;
  responseSemantics: ResponseSemantics;
  timing: NbackTiming;
  display: {
    aperturePx: number;
    paddingYPx: number;
    cueHeightPx: number;
    cueMarginBottomPx: number;
    frameBackground: string;
    frameBorder: string;
    textColor: string;
    fixationFontSizePx: number;
    fixationFontWeight: number;
    stimulusFontSizePx: number;
    stimulusScale: number;
    imageWidthPx: number | null;
    imageHeightPx: number | null;
    imageUpscale: boolean;
  };
  rtTask: {
    enabled: boolean;
    timing: RtTiming;
    responseTerminatesTrial: boolean;
  };
  drt: NbackDrtConfig;
  imageAssets: {
    enabled: boolean;
    basePath: string;
    filenameTemplate: string;
    practiceVariant: number;
    mainVariants: number[];
    mainMode: "with_replacement" | "cycle";
  };
  stimuliCsv: CsvStimulusConfig | null;
  nbackPoolDraw: PoolDrawConfig;
  pmItemPoolDraw: PoolDrawConfig;
  pmCategoryDraw: CategoryDrawConfig;
  pmCueRules: ProspectiveMemoryCueRule[];
  pmCategories: string[];
  variableDefinitions: Record<string, unknown>;
  allowedKeys: string[];
  instructions: {
    introPages: string[];
    preBlockPages: string[];
    postBlockPages: string[];
    endPages: string[];
    blockIntroTemplate: string;
    blockIntroControlTemplate: string;
    blockIntroPmTemplate: string;
    pmTemplate: string | null;
    showBlockLabel: boolean;
    preBlockBeforeBlockIntro: boolean;
  };
  practiceBlocks: NbackBlockConfig[];
  mainBlocks: NbackBlockConfig[];
  stimuliByCategory: Record<string, string[]>;
  nbackRule: NbackRuleConfig;
  feedbackDefaults: TrialFeedbackConfig;
  redirectCompleteTemplate: string;
}

interface TrialRecord {
  participantId: string;
  variantId: string;
  blockLabel: string;
  blockIndex: number;
  blockType: string;
  nLevel: number;
  trialIndex: number;
  trialType: string;
  item: string;
  stimulusPath: string;
  stimulusVariant: number;
  sourceCategory: string;
  itemCategory: string;
  correctResponse: string;
  responseKey: string;
  responseRtMs: number;
  responseCorrect: number;
}

interface PreloadedStimulus {
  image: HTMLImageElement | null;
}

const NBACK_IMAGE_CACHE = new Map<string, Promise<HTMLImageElement | null>>();

interface NbackRuntimeState {
  parsed: ParsedNbackConfig;
  plan: PlannedBlock[];
  variableResolver: VariableResolver;
  eventLogger: ReturnType<typeof createEventLogger>;
  participantId: string;
  variantId: string;
}

async function prepareNbackRuntime(context: TaskAdapterContext): Promise<NbackRuntimeState> {
  const parsed = parseNbackConfig(context.taskConfig, context.selection, context.resolver);
  parsed.stimuliByCategory = await loadCategorizedStimulusPools({
    inlinePools: parsed.stimuliByCategory,
    csvConfig: parsed.stimuliCsv,
    resolver: context.resolver,
  });
  const rng = new SeededRandom(
    hashSeed(
      context.selection.participant.participantId,
      context.selection.participant.sessionId,
      context.selection.variantId,
    ),
  );
  const plan = buildExperimentPlan(parsed, rng);
  const eventLogger = createEventLogger(context.selection);
  return {
    parsed,
    plan,
    variableResolver: context.resolver,
    eventLogger,
    participantId: context.selection.participant.participantId,
    variantId: context.selection.variantId,
  };
}

async function runNbackJsPsychTask(context: TaskAdapterContext, runtime: NbackRuntimeState): Promise<unknown> {
  const { parsed, plan, eventLogger } = runtime;
  const root = context.container;
  const drtFrameLayout = computeCanvasFrameLayout({
    aperturePx: parsed.display.aperturePx,
    paddingYPx: parsed.display.paddingYPx,
    cueHeightPx: parsed.display.cueHeightPx,
    cueMarginBottomPx: parsed.display.cueMarginBottomPx,
  });
  const resolveNbackStimulusFrameRect = (): DOMRect | null => {
    const canvas = root.querySelector<HTMLCanvasElement>("#jspsych-canvas-stimulus, #jspsych-canvas-keyboard-response-stimulus canvas, canvas#jspsych-canvas-stimulus");
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    const canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width <= 0 || canvasRect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) return null;
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    const left = canvasRect.left;
    const top = canvasRect.top + drtFrameLayout.frameTopPx * scaleY;
    const width = drtFrameLayout.aperturePx * scaleX;
    const height = drtFrameLayout.aperturePx * scaleY;
    if (!(width > 0 && height > 0)) return null;
    return new DOMRect(left, top, width, height);
  };
  let jsPsychRef: ReturnType<typeof initJsPsych> | null = null;
  
  const runner = new TaskModuleRunner([]);
  runner.setOptions({
    onEvent: (event) => {
      const address = (event as any).address as TaskModuleAddress | undefined;
      eventLogger.emit(event.type, event, {
        blockIndex: address?.blockIndex ?? -1,
        trialIndex: address?.trialIndex ?? undefined,
      });
    }
  });

  const startDrtScope = (drtConfig: NbackDrtConfig, scope: "block" | "trial", blockIndex: number, trialIndex: number | null): void => {
    if (!drtConfig.enabled) return;
    runner.start({
      module: DrtController.asTaskModule({
        ...drtConfig,
        seed: hashSeed(
          context.selection.participant.participantId,
          context.selection.participant.sessionId,
          context.selection.variantId,
          "nback_drt",
          `B${blockIndex}${trialIndex !== null ? `T${trialIndex}` : ""}`
        )
      }),
      address: { scope, blockIndex, trialIndex },
      config: drtConfig,
      context: {
        displayElement: root,
        borderTargetElement: root,
        borderTargetRect: resolveNbackStimulusFrameRect,
      }
    });
  };

  const stopDrtScope = (scope: "block" | "trial", blockIndex: number, trialIndex: number | null): void => {
    runner.stop({ scope, blockIndex, trialIndex });
  };

  const removeKeyScrollBlocker = installKeyScrollBlocker(parsed.allowedKeys);
  if (nbackAdapter instanceof NbackTaskAdapter) {
    nbackAdapter.setKeyScrollRemover(removeKeyScrollBlocker);
  }
  
  root.style.maxWidth = "1000px";
  root.style.margin = "0 auto";
  root.style.fontFamily = "system-ui";
  root.style.lineHeight = "1.4";
  ensureJsPsychCanvasCentered(root);
  eventLogger.emit("task_start", { task: "nback", runner: "jspsych" });

  const timeline: any[] = [];
  pushJsPsychContinueScreen(
    timeline,
    CallFunctionPlugin,
    root,
    `<h2>${escapeHtml(parsed.title)}</h2><p>Participant: <code>${escapeHtml(runtime.participantId)}</code></p>`,
    "intro_start",
    "nback-continue-intro_start",
  );
  appendJsPsychContinuePages({
    timeline,
    plugin: CallFunctionPlugin,
    container: root,
    pages: parsed.instructions.introPages,
    phase: "intro_page",
    buttonIdPrefix: "nback-continue-intro_page",
    data: (index) => ({ introIndex: index }),
  });
  if (parsed.instructions.pmTemplate && parsed.pmCategories.length > 0) {
    pushJsPsychContinueScreen(
      timeline,
      CallFunctionPlugin,
      root,
      `<p>${escapeHtml(
        parsed.instructions.pmTemplate.replace("{pmCategoryText}", parsed.pmCategories.join(", ")),
      )}</p>`,
      "intro_pm_template",
      "nback-continue-intro_pm_template",
    );
  }

  await runTaskSession<PlannedBlock, PlannedTrial, null>({
    blocks: plan,
    getTrials: ({ block }) => block.trials,
    runTrial: async ({ block, trial }) => {
      if (block.drt.scope === "trial") {
        timeline.push({
          type: CallFunctionPlugin,
          data: {
            phase: "drt_scope_start",
            blockIndex: block.blockIndex,
            trialIndex: trial.trialIndex,
            scope: "trial",
          },
          func: () => {
            startDrtScope(block.drt, "trial", block.blockIndex, trial.trialIndex);
          },
        });
      }

      const resolvedStimulus = resolveStimulusPath(parsed, block, trial.item, trial.trialIndex, runtime.variableResolver);
      const preloaded = await preloadNbackStimulus(resolvedStimulus);
      appendJsPsychNbackTrial({
        timeline,
        parsed,
        block,
        trial,
        resolvedStimulus,
        runtime,
        preloaded,
        eventLogger,
      });

      if (block.drt.scope === "trial") {
        timeline.push({
          type: CallFunctionPlugin,
          data: {
            phase: "drt_scope_end",
            blockIndex: block.blockIndex,
            trialIndex: trial.trialIndex,
            scope: "trial",
          },
          func: () => {
            stopDrtScope("trial", block.blockIndex, trial.trialIndex);
          },
        });
      }
      return null;
    },
    hooks: {
      onBlockStart: ({ block }) => {
        timeline.push({
          type: CallFunctionPlugin,
          data: { phase: "block_start_hook", blockIndex: block.blockIndex },
          func: () => {
            eventLogger.emit("block_start", { label: block.label, nLevel: block.nLevel, blockType: block.blockType }, { blockIndex: block.blockIndex });
          },
        });

        const introTemplate = block.blockType === "PM"
          ? parsed.instructions.blockIntroPmTemplate
          : parsed.instructions.blockIntroControlTemplate;
        const introText = introTemplate
          .replace("{nLevel}", String(block.nLevel))
          .replace("{pmCategoryText}", block.activePmCategories.join(", "));
        const blockScreenHtml = (text: string): string =>
          parsed.instructions.showBlockLabel
            ? `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(text)}</p>`
            : `<p>${escapeHtml(text)}</p>`;
        const preBlockScreens = [...parsed.instructions.preBlockPages, ...block.beforeBlockScreens];
        const pushPreBlockScreens = () => {
          appendJsPsychContinuePages({
            timeline,
            plugin: CallFunctionPlugin,
            container: root,
            pages: preBlockScreens,
            phase: "block_pre_instruction",
            buttonIdPrefix: `nback-continue-block_pre_instruction-${block.blockIndex}`,
            html: (page) => blockScreenHtml(page),
            data: (index) => ({ blockIndex: block.blockIndex, instructionIndex: index }),
          });
        };
        const pushBlockIntro = () => {
          pushJsPsychContinueScreen(
            timeline,
            CallFunctionPlugin,
            root,
            blockScreenHtml(introText),
            "block_start",
            `nback-continue-block_start-${block.blockIndex}`,
            { blockIndex: block.blockIndex },
          );
        };
        if (parsed.instructions.preBlockBeforeBlockIntro) {
          pushPreBlockScreens();
          pushBlockIntro();
        } else {
          pushBlockIntro();
          pushPreBlockScreens();
        }

        timeline.push({
          type: CallFunctionPlugin,
          data: { phase: "drt_scope_start", blockIndex: block.blockIndex, scope: block.drt.scope },
          func: () => {
            if (block.drt.scope === "block") {
              startDrtScope(block.drt, "block", block.blockIndex, null);
            }
          },
        });
      },
      onBlockEnd: ({ block }) => {
        timeline.push({
          type: CallFunctionPlugin,
          data: { phase: "drt_scope_end", blockIndex: block.blockIndex, scope: block.drt.scope },
          func: () => {
            if (block.drt.scope === "block") {
              stopDrtScope("block", block.blockIndex, null);
            }
          },
        });

        timeline.push({
          type: CallFunctionPlugin,
          data: { phase: "block_end_hook", blockIndex: block.blockIndex },
          func: () => {
            const rows = getNbackResponseRowsFromValues(jsPsychRef?.data.get().values() ?? [], block.blockIndex);
            const blockCorrect = rows.reduce((acc, row) => acc + row.responseCorrect, 0);
            const blockResponded = rows.reduce((acc, row) => acc + (row.responseKey ? 1 : 0), 0);
            const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
            eventLogger.emit(
              "block_end",
              { label: block.label, nLevel: block.nLevel, blockType: block.blockType, accuracy, responded: blockResponded },
              { blockIndex: block.blockIndex },
            );
          },
        });

        timeline.push({
          type: CallFunctionPlugin,
          data: { phase: "block_end", blockIndex: block.blockIndex },
          async: true,
          func: (done: () => void) => {
            const rows = getNbackResponseRowsFromValues(jsPsychRef?.data.get().values() ?? [], block.blockIndex);
            const blockCorrect = rows.reduce((acc, row) => acc + row.responseCorrect, 0);
            const blockResponded = rows.reduce((acc, row) => acc + (row.responseKey ? 1 : 0), 0);
            const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
            const host = resolveJsPsychContentHost(root);
            void waitForContinue(
              host,
              `<h3>End of ${escapeHtml(block.label)}</h3><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p><p>Responses: <b>${blockResponded}</b> / ${block.trials.length}</p>`,
              { buttonId: `nback-end-${block.blockIndex}` },
            ).then(done);
          },
        });

        const postBlockScreens = [...parsed.instructions.postBlockPages, ...block.afterBlockScreens];
        appendJsPsychContinuePages({
          timeline,
          plugin: CallFunctionPlugin,
          container: root,
          pages: postBlockScreens,
          phase: "block_post_instruction",
          buttonIdPrefix: `nback-continue-block_post_instruction-${block.blockIndex}`,
          html: (page) =>
            parsed.instructions.showBlockLabel
              ? `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(page)}</p>`
              : `<p>${escapeHtml(page)}</p>`,
          data: (index) => ({ blockIndex: block.blockIndex, instructionIndex: index }),
        });
      },
    },
  });
  appendJsPsychContinuePages({
    timeline,
    plugin: CallFunctionPlugin,
    container: root,
    pages: parsed.instructions.endPages,
    phase: "end_page",
    buttonIdPrefix: "nback-continue-end_page",
    data: (index) => ({ endIndex: index }),
  });

  try {
    jsPsychRef = initJsPsych({
      display_element: root,
      on_trial_start: (trial: Record<string, unknown>) => {
        const data = asObject(trial?.data);
        setCursorHidden(shouldHideCursorForPhase(data?.phase));
      },
      on_finish: () => {
        setCursorHidden(false);
      },
    });
    await runJsPsychTimeline(jsPsychRef, timeline);
  } finally {
    runner.stopAll();
    setCursorHidden(false);
  }

  const records = collectNbackRecords(jsPsychRef.data.get().values(), runtime.participantId, runtime.variantId);
  const drtTransformEstimates = runtime.eventLogger.events
    .filter((entry) => entry.eventType === "drt_transform_estimate")
    .map((entry) => entry.eventData)
    .filter((entry) => entry !== undefined);
  await finalizeNbackRun(context, runtime, records, {
    runner: "jspsych",
    jsPsychData: jsPsychRef.data.get().values(),
    pm: {
      enabled: plan.some((block) => block.blockType === "PM" && block.activePmCategories.length > 0 && block.trials.some((trial) => trial.trialType === "PM")),
      blocks: plan.map((block) => ({
        blockIndex: block.blockIndex,
        blockType: block.blockType,
        activePmCategories: block.activePmCategories,
      })),
    },
    drt: {
      config: parsed.drt,
      scopeRecords: runner.getResults().map((res: any) => ({
        address: res.address ?? { scope: res.scope, blockIndex: res.blockIndex, trialIndex: res.trialIndex },
        data: res.data,
        responseRows: res.data?.responseRows,
        transforms: res.data?.transforms,
      })),
    },
    drtTransformEstimates,
  });
  
  return { records };
}

async function finalizeNbackRun(
  context: TaskAdapterContext,
  runtime: NbackRuntimeState,
  records: TrialRecord[],
  extras: Record<string, unknown>,
): Promise<void> {
  runtime.eventLogger.emit("task_complete", { task: "nback", runner: extras.runner ?? "unknown", nTrials: records.length });
  const payload = {
    selection: context.selection,
    mapping: runtime.parsed.mapping,
    timing: runtime.parsed.timing,
    records,
    events: runtime.eventLogger.events,
    ...extras,
  };
  const finalizeResult = await finalizeTaskRun({
    coreConfig: context.coreConfig,
    selection: context.selection,
    payload,
    csv: { contents: recordsToCsv(records), suffix: "nback" },
    completionStatus: "complete",
  });

  const completeTemplate = runtime.parsed.redirectCompleteTemplate;
  if (!finalizeResult.redirected && completeTemplate) {
    const url = resolveTemplate(completeTemplate, context.selection);
    if (url) {
      window.location.assign(url);
      return;
    }
  }
  context.container.innerHTML = renderCenteredNotice({
    title: "NBack complete",
    message: "Data saved locally.",
  });
}

function appendJsPsychNbackTrial(args: {
  timeline: any[];
  parsed: ParsedNbackConfig;
  block: PlannedBlock;
  trial: PlannedTrial;
  resolvedStimulus: string;
  runtime: NbackRuntimeState;
  preloaded: PreloadedStimulus;
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, parsed, block, trial, resolvedStimulus, runtime, preloaded, eventLogger } = args;
  const { timing } = parsed;
  const layout = computeCanvasFrameLayout({
    aperturePx: parsed.display.aperturePx,
    paddingYPx: parsed.display.paddingYPx,
    cueHeightPx: parsed.display.cueHeightPx,
    cueMarginBottomPx: parsed.display.cueMarginBottomPx,
  });
  const jsPsychAllowedKeys = toJsPsychChoices(resolveAllowedKeysForNback(parsed.responseSemantics, block));

  const rtTiming = parsed.rtTask.enabled
    ? parsed.rtTask.timing
    : {
        trialDurationMs: timing.trialDurationMs,
        fixationOnsetMs: 0,
        fixationDurationMs: timing.fixationDurationMs,
        stimulusOnsetMs: timing.stimulusOnsetMs,
        stimulusDurationMs: timing.trialDurationMs - timing.stimulusOnsetMs,
        responseWindowStartMs: timing.responseWindowStartMs,
        responseWindowEndMs: timing.responseWindowEndMs,
      };
  const phaseTiming = computeRtPhaseDurations(rtTiming, {
    responseTerminatesTrial: parsed.rtTask.enabled ? parsed.rtTask.responseTerminatesTrial : false,
  });
  const preFixationBlankMs = Math.max(0, Math.round(phaseTiming.preFixationBlankMs));
  const fixationMs = Math.max(0, Math.round(phaseTiming.fixationMs));
  const blankMs = Math.max(0, Math.round(phaseTiming.blankMs));
  const preResponseMs = Math.max(0, Math.round(phaseTiming.preResponseStimulusMs));
  const responseMs = Math.max(0, Math.round(phaseTiming.responseMs));
  const responsePreStimBlankMs = Math.max(0, Math.round(phaseTiming.responsePreStimulusBlankMs));
  const responseStimulusMs = Math.max(0, Math.round(phaseTiming.responseStimulusMs));
  const responsePostStimBlankMs = Math.max(0, Math.round(phaseTiming.responsePostStimulusBlankMs));
  const postResponseStimulusMs = Math.max(0, Math.round(phaseTiming.postResponseStimulusMs));
  const postResponseBlankMs = Math.max(0, Math.round(phaseTiming.postResponseBlankMs));
  let feedbackView: { text: string; color: string } | null = null;

  const baseData = {
    participantId: runtime.participantId,
    variantId: runtime.variantId,
    blockLabel: block.label,
    blockIndex: block.blockIndex,
    blockType: block.blockType,
    nLevel: block.nLevel,
    trialIndex: trial.trialIndex,
    trialType: trial.trialType,
    item: trial.item,
    stimulusPath: resolvedStimulus,
    stimulusVariant: block.stimulusVariant ?? -1,
    sourceCategory: trial.sourceCategory,
    itemCategory: trial.itemCategory,
    correctResponse: trial.correctResponse,
  };

  if (preFixationBlankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: preFixationBlankMs,
      data: { ...baseData, phase: "nback_pre_fixation_blank" },
    });
  }

  if (fixationMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: true, showStimulus: false });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: fixationMs,
      data: { ...baseData, phase: "nback_fixation" },
    });
  }

  if (blankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: blankMs,
      data: { ...baseData, phase: "nback_blank" },
    });
  }

  if (preResponseMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: preResponseMs,
      data: { ...baseData, phase: "nback_stimulus_pre_response" },
    });
  }

  const responseSegments: Array<{ phase: string; durationMs: number; showStimulus: boolean; isFinal: boolean }> = [];
  if (!parsed.rtTask.responseTerminatesTrial && parsed.rtTask.enabled) {
    if (responsePreStimBlankMs > 0) {
      responseSegments.push({ phase: "nback_response_window_pre_stim_blank", durationMs: responsePreStimBlankMs, showStimulus: false, isFinal: false });
    }
    if (responseStimulusMs > 0) {
      responseSegments.push({ phase: "nback_response_window_stimulus", durationMs: responseStimulusMs, showStimulus: true, isFinal: false });
    }
    if (responsePostStimBlankMs > 0) {
      responseSegments.push({ phase: "nback_response_window_post_stim_blank", durationMs: responsePostStimBlankMs, showStimulus: false, isFinal: false });
    }
  }
  if (responseSegments.length === 0) {
    responseSegments.push({ phase: "nback_response_window", durationMs: responseMs, showStimulus: true, isFinal: true });
  } else {
    responseSegments[responseSegments.length - 1].phase = "nback_response_window";
    responseSegments[responseSegments.length - 1].isFinal = true;
  }

  let capturedKey: string | null = null;
  let capturedRt: number | null = null;
  let captured = false;

  for (const segment of responseSegments) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: segment.showStimulus });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: segment.durationMs > 0 ? jsPsychAllowedKeys : "NO_KEYS",
      response_ends_trial: parsed.rtTask.responseTerminatesTrial,
      trial_duration: segment.durationMs,
      data: { ...baseData, phase: segment.phase },
      on_finish: (data: Record<string, unknown>) => {
        if (!captured) {
          const key = typeof data.response === "string" ? normalizeKey(data.response) : null;
          const rt = typeof data.rt === "number" && Number.isFinite(data.rt) ? data.rt : null;
          if (key || rt != null) {
            capturedKey = key;
            capturedRt = rt;
            captured = true;
          }
        }

        if (!segment.isFinal) return;
        const evaluated = evaluateNbackOutcome(parsed, block, trial, capturedKey, capturedRt);
        feedbackView = resolveTrialFeedbackView({
          feedback: block.feedback,
          responseCategory: evaluated.responseCategory,
          correct: evaluated.correct,
          vars: {
            item: trial.item,
            trialType: trial.trialType,
            blockLabel: block.label,
            expectedCategory: evaluated.expectedCategory,
            responseCategory: evaluated.responseCategory,
          },
          resolver: runtime.variableResolver,
          resolverContext: {
            blockIndex: block.blockIndex,
            trialIndex: trial.trialIndex,
          },
        });
        Object.assign(data, {
          response: capturedKey ?? null,
          rt: capturedRt,
          responseKey: capturedKey ?? "",
          responseRtMs: evaluated.rtMs,
          responseCorrect: evaluated.correct,
          responseCategory: evaluated.responseCategory,
          expectedCategory: evaluated.expectedCategory,
        });
        eventLogger.emit(
          "trial_complete",
          {
            trialType: trial.trialType,
            correct: evaluated.correct,
            responded: evaluated.responded,
            responseKey: capturedKey ?? "",
            rtMs: evaluated.rtMs,
            responseCategory: evaluated.responseCategory,
          },
          { blockIndex: block.blockIndex, trialIndex: trial.trialIndex },
        );
      },
    });
  }

  if (postResponseStimulusMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: postResponseStimulusMs,
      data: { ...baseData, phase: "nback_post_response" },
    });
  }
  if (postResponseBlankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawNbackPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: postResponseBlankMs,
      data: { ...baseData, phase: "nback_post_response_blank" },
    });
  }

  if (block.feedback.enabled && block.feedback.durationMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        drawTrialFeedbackOnCanvas(ctx, layout, block.feedback, feedbackView);
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: block.feedback.durationMs,
      data: { ...baseData, phase: "nback_feedback" },
    });
  }
}

function drawNbackPhase(
  canvas: HTMLCanvasElement,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  parsed: ParsedNbackConfig,
  preloaded: PreloadedStimulus,
  trial: PlannedTrial,
  flags: { showFixation: boolean; showStimulus: boolean },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCanvasFramedScene(
    ctx,
    layout,
    {
      cueText: "",
      frameBackground: parsed.display.frameBackground,
      frameBorder: parsed.display.frameBorder,
    },
    ({ centerX, centerY, frameSize }) => {
      if (flags.showFixation) {
        drawCanvasCenteredText(ctx, centerX, centerY, "+", {
          color: parsed.display.textColor,
          fontSizePx: parsed.display.fixationFontSizePx,
          fontWeight: parsed.display.fixationFontWeight,
        });
        return;
      }
      if (!flags.showStimulus) return;
      if (preloaded.image) {
        drawSizedImage(
          ctx,
          preloaded.image,
          centerX,
          centerY,
          parsed.display.imageWidthPx,
          parsed.display.imageHeightPx,
          frameSize * parsed.display.stimulusScale,
          frameSize * parsed.display.stimulusScale,
          parsed.display.imageUpscale,
        );
        return;
      }
      drawCanvasCenteredText(ctx, centerX, centerY, trial.item, {
        color: parsed.display.textColor,
        fontSizePx: parsed.display.stimulusFontSizePx,
        fontWeight: 700,
      });
    },
  );
}

function evaluateNbackOutcome(
  parsed: ParsedNbackConfig,
  block: PlannedBlock,
  trial: PlannedTrial,
  responseKey: string | null,
  rtMs: number | null,
): {
  correct: 0 | 1;
  responded: 0 | 1;
  responseCategory: string;
  expectedCategory: string;
  rtMs: number;
} {
  const responseCategory = parsed.responseSemantics.responseCategoryFromKey(responseKey);
  const expectedCategory = parsed.responseSemantics.expectedCategoryFromSpec(trial.correctResponse, "timeout");
  const outcome = evaluateTrialOutcome({
    responseCategory,
    rt: rtMs,
    expectedCategory,
    meta: {
      trialType: trial.trialType,
      item: trial.item,
    },
  });
  return {
    correct: outcome.correct,
    responded: responseKey ? 1 : 0,
    responseCategory: outcome.responseCategory,
    expectedCategory: outcome.expectedCategory ?? expectedCategory,
    rtMs: outcome.rt,
  };
}

function resolveAllowedKeysForNback(semantics: ResponseSemantics, block: PlannedBlock): string[] {
  if (block.blockType === "PM") {
    return semantics.allowedKeys(["target", "non_target", "pm"]);
  }
  return semantics.allowedKeys(["target", "non_target"]);
}

function collectNbackRecords(rows: Array<Record<string, unknown>>, participantId: string, variantId: string): TrialRecord[] {
  const output: TrialRecord[] = [];
  for (const row of rows) {
    if (row.phase !== "nback_response_window") continue;
    output.push({
      participantId: asString(row.participantId) || participantId,
      variantId: asString(row.variantId) || variantId,
      blockLabel: asString(row.blockLabel) || "",
      blockIndex: Number(row.blockIndex ?? -1),
      blockType: asString(row.blockType) || "",
      nLevel: Number(row.nLevel ?? -1),
      trialIndex: Number(row.trialIndex ?? -1),
      trialType: asString(row.trialType) || "",
      item: asString(row.item) || "",
      stimulusPath: asString(row.stimulusPath) || "",
      stimulusVariant: Number(row.stimulusVariant ?? -1),
      sourceCategory: asString(row.sourceCategory) || "",
      itemCategory: asString(row.itemCategory) || "",
      correctResponse: asString(row.correctResponse) || "",
      responseKey: typeof row.responseKey === "string" ? normalizeKey(row.responseKey) : "",
      responseRtMs: Number(row.responseRtMs ?? -1),
      responseCorrect: Number(row.responseCorrect ?? 0) === 1 ? 1 : 0,
    });
  }
  return output;
}

function getNbackResponseRowsFromValues(rows: Array<Record<string, unknown>>, blockIndex: number): TrialRecord[] {
  return collectNbackRecords(rows, "", "").filter((row) => row.blockIndex === blockIndex);
}

function parseNbackConfig(
  config: JSONObject,
  selection: TaskAdapterContext["selection"] | undefined,
  variableResolver: VariableResolver,
): ParsedNbackConfig {
  const mappingRaw = asObject(config.mapping);
  const targetKey = normalizeKey(asString(mappingRaw?.targetKey) || "m");
  const nonTargetKey = parseOptionalResponseKey(mappingRaw?.nonTargetKey ?? "z");
  const taskRaw = asObject(config.task);
  const pmRaw = asObject(taskRaw?.pm);
  const pmKey = parseOptionalResponseKey(mappingRaw?.pmKey ?? pmRaw?.key);
  if (nonTargetKey && targetKey === nonTargetKey) {
    throw new Error("Invalid NBack mapping: target and nonTarget keys must be distinct.");
  }
  if (pmKey && (pmKey === targetKey || (nonTargetKey ? pmKey === nonTargetKey : false))) {
    throw new Error("Invalid NBack mapping: pm key must be distinct from target/nonTarget.");
  }
  const responseSemantics = createResponseSemantics(
    pmKey
      ? (nonTargetKey
          ? { target: targetKey, non_target: nonTargetKey, pm: pmKey }
          : { target: targetKey, pm: pmKey })
      : (nonTargetKey
          ? { target: targetKey, non_target: nonTargetKey }
          : { target: targetKey }),
  );

  const timingRaw = asObject(config.timing);
  const timing: NbackTiming = {
    trialDurationMs: toPositiveNumber(timingRaw?.trialDurationMs, 5000),
    fixationDurationMs: toNonNegativeNumber(timingRaw?.fixationDurationMs, 500),
    stimulusOnsetMs: toNonNegativeNumber(timingRaw?.stimulusOnsetMs, 1000),
    responseWindowStartMs: toNonNegativeNumber(timingRaw?.responseWindowStartMs, 1000),
    responseWindowEndMs: toNonNegativeNumber(timingRaw?.responseWindowEndMs, 5000),
  };
  const rtTaskRaw = asObject(taskRaw?.rtTask);
  const rtTaskTimingRaw = asObject(rtTaskRaw?.timing);
  const rtTrialDurationMs = toPositiveNumber(rtTaskTimingRaw?.trialDurationMs, timing.trialDurationMs);
  const rtStimulusOnsetMs = toNonNegativeNumber(rtTaskTimingRaw?.stimulusOnsetMs, timing.stimulusOnsetMs);
  const rtTaskTiming: RtTiming = {
    trialDurationMs: rtTrialDurationMs,
    fixationOnsetMs: toNonNegativeNumber(rtTaskTimingRaw?.fixationOnsetMs, 0),
    fixationDurationMs: toNonNegativeNumber(rtTaskTimingRaw?.fixationDurationMs, timing.fixationDurationMs),
    stimulusOnsetMs: rtStimulusOnsetMs,
    stimulusDurationMs: toNonNegativeNumber(
      rtTaskTimingRaw?.stimulusDurationMs,
      Math.max(0, rtTrialDurationMs - rtStimulusOnsetMs),
    ),
    responseWindowStartMs: toNonNegativeNumber(rtTaskTimingRaw?.responseWindowStartMs, timing.responseWindowStartMs),
    responseWindowEndMs: toNonNegativeNumber(rtTaskTimingRaw?.responseWindowEndMs, timing.responseWindowEndMs),
  };
  const rtTask = {
    enabled: rtTaskRaw ? rtTaskRaw.enabled !== false : false,
    timing: rtTaskTiming,
    responseTerminatesTrial: rtTaskRaw ? rtTaskRaw.responseTerminatesTrial === true : false,
  };
  const drtRaw = asObject(taskRaw?.drt);
  const drt = resolveNbackDrtConfig(
    {
      enabled: false,
      scope: "block",
      key: "space",
      transformPersistence: "scope",
      responseWindowMs: 1500,
      displayDurationMs: 1000,
      responseTerminatesStimulus: true,
      isiSampler: { type: "uniform", min: 3000, max: 5000 },
      parameterTransforms: [],
      stimMode: "visual",
      stimModes: [],
      visual: {
        shape: "square",
        color: "#dc2626",
        sizePx: 32,
        topPx: 16,
        leftPx: null,
      },
      audio: {
        volume: 0.25,
        frequencyHz: 900,
        durationMs: 120,
        waveform: "sine",
      },
      border: {
        color: "#dc2626",
        widthPx: 4,
        radiusPx: 0,
        target: "display",
      },
    },
    drtRaw,
  );
  const displayRaw = asObject(config.display);
  const display = {
    aperturePx: toPositiveNumber(displayRaw?.aperturePx, 250),
    paddingYPx: toNonNegativeNumber(displayRaw?.paddingYPx, 16),
    cueHeightPx: toNonNegativeNumber(displayRaw?.cueHeightPx, 0),
    cueMarginBottomPx: toNonNegativeNumber(displayRaw?.cueMarginBottomPx, 0),
    frameBackground: asString(displayRaw?.frameBackground) || "#ffffff",
    frameBorder: asString(displayRaw?.frameBorder) || "2px solid #d1d5db",
    textColor: asString(displayRaw?.textColor) || "#111827",
    fixationFontSizePx: toPositiveNumber(displayRaw?.fixationFontSizePx, 28),
    fixationFontWeight: toPositiveNumber(displayRaw?.fixationFontWeight, 500),
    stimulusFontSizePx: toPositiveNumber(displayRaw?.stimulusFontSizePx, 48),
    stimulusScale: Math.max(0.1, Math.min(1, Number(displayRaw?.stimulusScale ?? 0.82))),
    imageWidthPx: Number.isFinite(Number(displayRaw?.imageWidthPx))
      ? Math.max(1, Math.floor(Number(displayRaw?.imageWidthPx)))
      : null,
    imageHeightPx: Number.isFinite(Number(displayRaw?.imageHeightPx))
      ? Math.max(1, Math.floor(Number(displayRaw?.imageHeightPx)))
      : null,
    imageUpscale: displayRaw?.imageUpscale === true,
  };
  const feedbackDefaults = parseTrialFeedbackConfig(asObject(config.feedback), null, {
    style: {
      canvasBackground: display.frameBackground,
      canvasBorder: display.frameBorder,
      fontSizePx: Math.max(16, Math.round(display.stimulusFontSizePx * 0.6)),
      fontWeight: 700,
    },
  });

  const plan = asObject(config.plan);
  const nbackRuleRaw = asObject(config.nbackRule);
  const imageAssetsRaw = asObject(config.imageAssets);
  const stimuliCsvRaw = asObject(config.stimuliCsv);
  const stimulusPoolsRaw = asObject(config.stimulusPools);
  const configVariables = asObject(config.variables);
  const taskVariables = asObject(asObject(config.task)?.variables);
  const variableDefinitions = {
    ...(taskVariables ?? {}),
    ...(configVariables ?? {}),
  };
  
  const lureLagPasses = parseLureLagPasses(nbackRuleRaw?.lureLagPasses);
  const maxInsertionAttempts = toPositiveNumber(nbackRuleRaw?.maxInsertionAttempts, 10);
  const planManipulations = createManipulationOverrideMap(plan?.manipulations);
  const planPoolAllocator = createManipulationPoolAllocator(
    plan?.manipulationPools,
    selection
      ? [
          selection.participant.participantId,
          selection.participant.sessionId,
          selection.variantId,
          "nback_plan_manipulation_pools",
        ]
      : ["nback_plan_manipulation_pools"],
  );
  const mergedBlocks = asArray(plan?.blocks).map((entry, index) =>
    parseBlock(
      applyManipulationOverridesToBlock(
        entry,
        resolveBlockManipulationIds(entry, planPoolAllocator),
        planManipulations,
        `Invalid NBack plan: block ${index + 1}`,
      ),
      index,
      null,
      variableResolver,
      feedbackDefaults,
      drt,
    ),
  );
  const parsedPracticeBlocks = mergedBlocks.filter((block) => block.isPractice);
  const parsedMainBlocks = mergedBlocks.filter((block) => !block.isPractice);
  if (mergedBlocks.length === 0) throw new Error("Invalid NBack plan: plan.blocks is empty.");

  const stimuliByCategory = parseStimulusPools(config, variableResolver);
  const referencedCategories = mergedBlocks.flatMap((block) => [
    ...block.activePmCategories,
    ...block.controlSourceCategories,
    ...block.nbackSourceCategories,
  ]);
  ensureStimulusCategories(stimuliByCategory, referencedCategories);

  const pmCategories = Array.from(new Set(mergedBlocks.flatMap((b) => b.activePmCategories)));
  const instructionsRaw = asObject(config.instructions);
  const instructionSlots = resolveInstructionFlowPages({
    title: asString(taskRaw?.title) || "NBack Task",
    instructions: instructionsRaw,
    defaults: {
      intro: [
        nonTargetKey
          ? "Respond for n-back targets and non-targets using the mapped keys."
          : "Respond only to n-back targets. Withhold response for non-targets.",
      ],
    },
  });
  const pmTemplateConfig = instructionsRaw?.pmTemplate;
  const pmTemplate = typeof pmTemplateConfig === "string"
    ? (pmTemplateConfig.trim() ? pmTemplateConfig.trim() : null)
    : "PM categories for this block: {pmCategoryText}";
  const completeRaw = asObject(config.completion);
  const redirectRaw = asObject(completeRaw?.redirect);

  const hasPmResponseTrials = mergedBlocks.some(
    (block) => block.blockType === "PM" && block.pmCount > 0 && Boolean(pmKey),
  );
  const taskAllowedKeys = hasPmResponseTrials
    ? responseSemantics.allowedKeys(["target", "non_target", "pm"])
    : responseSemantics.allowedKeys(["target", "non_target"]);
  const drtKeysByBlock = mergedBlocks.filter((block) => block.drt.enabled).map((block) => block.drt.key);
  const allowedKeysSet = new Set([...taskAllowedKeys, ...drtKeysByBlock]);
  if (drt.enabled) allowedKeysSet.add(drt.key);
  const finalAllowedKeys = Array.from(allowedKeysSet);

  return {
    title: asString(taskRaw?.title) || "NBack Task",
    mapping: { targetKey, nonTargetKey, pmKey },
    responseSemantics,
    timing,
    display,
    rtTask,
    drt,
    imageAssets: {
      enabled: imageAssetsRaw?.enabled === true,
      basePath: asString(imageAssetsRaw?.basePath) || "",
      filenameTemplate: asString(imageAssetsRaw?.filenameTemplate) || "{id}",
      practiceVariant: toPositiveNumber(imageAssetsRaw?.practiceVariant, 1),
      mainVariants: asPositiveNumberArray(imageAssetsRaw?.mainVariants, [1]),
      mainMode:
        (asString(imageAssetsRaw?.mainMode) || "with_replacement").toLowerCase() === "cycle"
          ? "cycle"
          : "with_replacement",
    },
    stimuliCsv: coerceCsvStimulusConfig(stimuliCsvRaw),
    nbackPoolDraw: coercePoolDrawConfig(asObject(stimulusPoolsRaw?.nbackDraw), {
      mode: "without_replacement",
      shuffle: true,
    }),
    pmItemPoolDraw: coercePoolDrawConfig(asObject(stimulusPoolsRaw?.pmItemDraw), {
      mode: "without_replacement",
      shuffle: true,
    }),
    pmCategoryDraw: coerceCategoryDrawConfig(asObject(stimulusPoolsRaw?.pmCategoryDraw), {
      mode: "round_robin",
      shuffle: true,
    }),
    pmCueRules: [],
    pmCategories,
    variableDefinitions,
    allowedKeys: finalAllowedKeys,
    instructions: {
      introPages: instructionSlots.intro,
      preBlockPages: instructionSlots.preBlock,
      postBlockPages: instructionSlots.postBlock,
      endPages: instructionSlots.end,
      blockIntroTemplate: asString(instructionsRaw?.blockIntroTemplate) || "This is a {nLevel}-back block.",
      blockIntroControlTemplate:
        asString(instructionsRaw?.blockIntroControlTemplate) ||
        (pmKey
          ? "This is a {nLevel}-back block. There are no PM trials in this block."
          : "This is a {nLevel}-back block."),
      blockIntroPmTemplate:
        asString(instructionsRaw?.blockIntroPmTemplate) ||
        "This is a {nLevel}-back PM block. Watch for {pmCategoryText}.",
      pmTemplate,
      showBlockLabel: instructionsRaw?.showBlockLabel !== false,
      preBlockBeforeBlockIntro: instructionsRaw?.preBlockBeforeBlockIntro === true,
    },
    practiceBlocks: parsedPracticeBlocks,
    mainBlocks: parsedMainBlocks,
    stimuliByCategory,
    nbackRule: {
      lureLagPasses,
      maxInsertionAttempts,
    },
    feedbackDefaults,
    redirectCompleteTemplate: asString(redirectRaw?.completeUrlTemplate) || "",
  };
}

function parseBlock(
  entry: unknown,
  index: number,
  isPractice: boolean | null,
  variableResolver: VariableResolver,
  feedbackFallback?: TrialFeedbackConfig,
  drtFallback?: NbackDrtConfig,
): NbackBlockConfig {
  const b = asObject(entry);
  if (!b) throw new Error(`Invalid NBack plan: block ${index + 1} is not an object.`);
  const scope = { blockIndex: index };
  const resolvedPhase = variableResolver.resolveToken(b.phase, scope);
  const phaseRaw = (asString(resolvedPhase) || "").toLowerCase();
  const resolvedIsPractice = variableResolver.resolveToken(b.isPractice, scope);
  const inferredPractice = typeof resolvedIsPractice === "boolean" ? resolvedIsPractice : phaseRaw === "practice";
  const isPracticeResolved = isPractice ?? inferredPractice;
  const resolvedLabel = variableResolver.resolveToken(b.label, scope);
  const label = asString(resolvedLabel) || `${isPracticeResolved ? "Practice" : "Block"} ${index + 1}`;
  const resolvedTrials = variableResolver.resolveToken(b.trials, scope);
  const trials = toPositiveNumber(resolvedTrials, isPracticeResolved ? 20 : 54);
  const resolvedNLevel = variableResolver.resolveToken(b.nLevel, scope);
  const nLevel = toPositiveNumber(resolvedNLevel, isPracticeResolved ? 2 : 1);
  const resolvedBlockType = variableResolver.resolveToken(b.blockType, scope);
  const rawType = (asString(resolvedBlockType) || "control").toLowerCase();
  if (rawType !== "pm" && rawType !== "control") {
    throw new Error(`Invalid NBack plan: block '${label}' has invalid blockType.`);
  }
  const blockType: "PM" | "Control" = rawType === "pm" ? "PM" : "Control";

  const nbackSourceCategories = expandCategoryEntriesWithVariables(
    asStringArray(b.nbackSourceCategories, ["other"]),
    variableResolver,
    scope,
  );
  const activePmCategories = expandCategoryEntriesWithVariables(
    asStringArray(b.activePmCategories, []),
    variableResolver,
    scope,
  );
  const controlSourceCategories = expandCategoryEntriesWithVariables(
    asStringArray(b.controlSourceCategories, []),
    variableResolver,
    scope,
  );
  const resolvedPmCount = variableResolver.resolveToken(b.pmCount, scope);
  const resolvedMinPmSep = variableResolver.resolveToken(b.minPmSeparation, scope);
  const resolvedMaxPmSep = variableResolver.resolveToken(b.maxPmSeparation, scope);
  const resolvedTargetCount = variableResolver.resolveToken(b.targetCount, scope);
  const resolvedLureCount = variableResolver.resolveToken(b.lureCount, scope);
  const resolvedStimulusVariant = variableResolver.resolveToken(b.stimulusVariant, scope);
  const resolvedFeedbackRaw = variableResolver.resolveToken(b.feedback, scope);
  const rawBeforeBlockScreens = b.beforeBlockScreens ?? b.preBlockInstructions;
  const rawAfterBlockScreens = b.afterBlockScreens ?? b.postBlockInstructions;
  const rawDrt = b.drt ?? b.drtOverride;
  const resolvedBeforeBlockScreens = variableResolver.resolveInValue(rawBeforeBlockScreens, scope);
  const resolvedAfterBlockScreens = variableResolver.resolveInValue(rawAfterBlockScreens, scope);
  const resolvedDrt = variableResolver.resolveToken(rawDrt, scope);
  const feedback = parseTrialFeedbackConfig(asObject(resolvedFeedbackRaw), feedbackFallback ?? null);
  const drt = resolveNbackDrtConfig(
    drtFallback ??
      resolveNbackDrtConfig(
        {
          enabled: false,
          scope: "block",
          key: "space",
          transformPersistence: "scope",
          responseWindowMs: 1500,
          displayDurationMs: 1000,
          responseTerminatesStimulus: true,
          isiSampler: { type: "uniform", min: 3000, max: 5000 },
          parameterTransforms: [],
          stimMode: "visual",
          stimModes: [],
          visual: {
            shape: "square",
            color: "#dc2626",
            sizePx: 32,
            topPx: 16,
            leftPx: null,
          },
          audio: {
            volume: 0.25,
            frequencyHz: 900,
            durationMs: 120,
            waveform: "sine",
          },
          border: {
            color: "#dc2626",
            widthPx: 4,
            radiusPx: 0,
            target: "display",
          },
        },
        null,
      ),
    asObject(resolvedDrt),
  );

  return {
    label,
    isPractice: isPracticeResolved,
    nLevel,
    trials,
    blockType,
    activePmCategories,
    controlSourceCategories,
    pmCount: toNonNegativeNumber(resolvedPmCount, 0),
    minPmSeparation: toPositiveNumber(resolvedMinPmSep, 8),
    maxPmSeparation: toPositiveNumber(resolvedMaxPmSep, 11),
    nbackSourceCategories,
    targetCount: toNonNegativeNumber(resolvedTargetCount, isPracticeResolved ? 6 : 18),
    lureCount: toNonNegativeNumber(resolvedLureCount, isPracticeResolved ? 3 : 18),
    stimulusVariant: Number.isFinite(Number(resolvedStimulusVariant))
      ? Math.max(1, Math.floor(Number(resolvedStimulusVariant)))
      : null,
    feedback,
    beforeBlockScreens: toStringScreens(resolvedBeforeBlockScreens),
    afterBlockScreens: toStringScreens(resolvedAfterBlockScreens),
    drt,
  };
}

function parseStimulusPools(config: JSONObject, resolver: VariableResolver): Record<string, string[]> {
  const stimuliRaw = asObject(resolver.resolveInValue(config.stimuli));
  if (!stimuliRaw) {
    return {
      pm: makeSynthetic("pm", 400),
      control: makeSynthetic("control", 400),
      other: makeSynthetic("other", 600),
    };
  }
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(stimuliRaw)) {
    const list = asArray(value).map((item) => asString(item)).filter((item): item is string => Boolean(item));
    if (list.length > 0) out[key] = list;
  }
  if (!out.pm) out.pm = makeSynthetic("pm", 400);
  if (!out.control) out.control = makeSynthetic("control", 400);
  if (!out.other) out.other = makeSynthetic("other", 600);
  return out;
}

function makeSynthetic(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, idx) => `${prefix}_${String(idx + 1).padStart(3, "0")}`);
}

function ensureStimulusCategories(pools: Record<string, string[]>, categories: string[]): void {
  for (const raw of categories) {
    const category = String(raw || "").trim();
    if (!category) continue;
    if (!Array.isArray(pools[category]) || pools[category].length === 0) {
      pools[category] = makeSynthetic(category, 400);
    }
  }
}

function buildExperimentPlan(config: ParsedNbackConfig, rng: SeededRandom): PlannedBlock[] {
  const blocks = [...config.practiceBlocks, ...config.mainBlocks];
  let mainCycleIndex = 0;
  return blocks.map((block, index) => {
    const resolvedVariant = resolveBlockStimulusVariant(config, block, rng, mainCycleIndex);
    if (!block.isPractice && config.imageAssets.mainMode === "cycle" && config.imageAssets.mainVariants.length > 0) {
      mainCycleIndex += 1;
    }
    return buildBlockPlanWithChecks(block, index, config, rng, resolvedVariant);
  });
}

function buildBlockPlanWithChecks(
  block: NbackBlockConfig,
  blockIndex: number,
  config: ParsedNbackConfig,
  rng: SeededRandom,
  stimulusVariant: number | null,
): PlannedBlock {
  const maxAttempts = Math.max(5, config.nbackRule.maxInsertionAttempts * 3);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return buildBlockPlanAttempt(block, blockIndex, config, rng, stimulusVariant);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw new Error(`Failed to generate valid NBack block '${block.label}' after ${maxAttempts} attempts: ${lastError?.message ?? "unknown error"}`);
}

function buildBlockPlanAttempt(
  block: NbackBlockConfig,
  blockIndex: number,
  config: ParsedNbackConfig,
  rng: SeededRandom,
  stimulusVariant: number | null,
): PlannedBlock {
  const effectivePmCount =
    block.blockType === "Control" && block.controlSourceCategories.length === 0
      ? 0
      : block.pmCount;
  const pmPositions = generateProspectiveMemoryPositions(rng, block.trials, {
    count: effectivePmCount,
    minSeparation: block.minPmSeparation,
    maxSeparation: block.maxPmSeparation,
  });
  const pmPositionSet = new Set(pmPositions);

  const excluded = new Set([...block.activePmCategories, ...block.controlSourceCategories]);
  const nbackCandidates = collectPoolCandidates(config.stimuliByCategory, block.nbackSourceCategories, excluded);
  if (nbackCandidates.length === 0) {
    nbackCandidates.push(...collectPoolCandidates(config.stimuliByCategory, ["other"], new Set<string>()));
  }
  if (nbackCandidates.length === 0) throw new Error(`Block '${block.label}' has no n-back candidate items.`);

  const drawPm = createCategoryPoolDrawer(
    config.stimuliByCategory,
    block.blockType === "PM" ? block.activePmCategories : block.controlSourceCategories,
    rng,
    { itemDraw: config.pmItemPoolDraw, categoryDraw: config.pmCategoryDraw },
  );
  const drawNback = createPoolDrawer(nbackCandidates, rng, config.nbackPoolDraw);
  const trials: PlannedTrial[] = [];
  const nonTargetResponseSpec = config.mapping.nonTargetKey ?? "timeout";

  for (let i = 0; i < block.trials; i += 1) {
    if (pmPositionSet.has(i) && config.mapping.pmKey) {
      const picked = drawPm();
      trials.push({
        trialIndex: i,
        trialType: "PM",
        item: picked.item,
        sourceCategory: picked.category,
        itemCategory: block.blockType === "PM" ? "PM" : "Control",
        correctResponse: config.mapping.pmKey,
      });
    } else {
      const picked = drawNback();
      trials.push({
        trialIndex: i,
        trialType: "F",
        item: picked.item,
        sourceCategory: picked.category,
        itemCategory: "other",
        correctResponse: nonTargetResponseSpec,
      });
    }
  }

  let insertedTargets = 0;
  for (let i = 0; i < config.nbackRule.maxInsertionAttempts; i += 1) {
    insertedTargets += injectNBackTargets(
      rng,
      trials,
      block.nLevel,
      block.targetCount - insertedTargets,
      config.mapping.targetKey,
    );
    if (insertedTargets >= block.targetCount) break;
  }

  let insertedLures = 0;
  for (const lagPass of config.nbackRule.lureLagPasses) {
    insertedLures += injectNBackLures(rng, trials, block.nLevel, block.lureCount - insertedLures, lagPass);
    if (insertedLures >= block.lureCount) break;
  }
  if (block.blockType === "Control") {
    for (const pos of pmPositions) {
      const trial = trials[pos];
      if (!trial) continue;
      trial.trialType = "F";
      trial.correctResponse = nonTargetResponseSpec;
      trial.itemCategory = "Control";
    }
  }

  const planned: PlannedBlock = {
    blockIndex,
    label: block.label,
    blockType: block.blockType,
    isPractice: block.isPractice,
    nLevel: block.nLevel,
    stimulusVariant,
    activePmCategories: block.activePmCategories,
    trials,
    feedback: block.feedback,
    beforeBlockScreens: block.beforeBlockScreens,
    afterBlockScreens: block.afterBlockScreens,
    drt: block.drt,
  };
  validateNbackBlock(planned, pmPositionSet, config.mapping);
  return planned;
}

function injectNBackTargets(
  rng: SeededRandom,
  trials: PlannedTrial[],
  nLevel: number,
  nTargets: number,
  targetKey: string,
): number {
  let inserted = 0;
  if (nTargets <= 0) return 0;
  const candidates = Array.from({ length: Math.max(0, trials.length - nLevel) }, (_, idx) => idx + nLevel);
  rng.shuffle(candidates);
  for (const pos of candidates) {
    const backPos = pos - nLevel;
    const prevPos = pos - 1;
    const nextPos = pos + 1;
    if (inserted >= nTargets) break;
    if (prevPos >= 0 && trials[prevPos].trialType !== "F") continue;
    if (nextPos < trials.length && trials[nextPos].trialType === "N") continue;
    if (trials[pos].usedAsSource) continue;
    if (trials[backPos].usedAsSource) continue;
    if (trials[pos].trialType !== "F" || trials[backPos].trialType !== "F") continue;
    trials[pos].item = trials[backPos].item;
    trials[pos].sourceCategory = trials[backPos].sourceCategory;
    trials[pos].trialType = "N";
    trials[pos].correctResponse = targetKey;
    trials[pos].usedAsSource = true;
    trials[backPos].usedAsSource = true;
    inserted += 1;
  }
  return inserted;
}

function injectNBackLures(
  rng: SeededRandom,
  trials: PlannedTrial[],
  nLevel: number,
  nLures: number,
  lureLags: number[],
): number {
  if (nLures <= 0 || lureLags.length === 0) return 0;
  const candidates: Array<[number, number, number]> = [];
  const start = Math.max(...lureLags);
  for (let pos = start; pos < trials.length; pos += 1) {
    if (trials[pos].trialType !== "F") continue;
    if (trials[pos].usedAsSource) continue;
    for (const lag of lureLags) {
      if (lag === nLevel) continue;
      const lurePos = pos - lag;
      if (lurePos < 0) continue;
      if (trials[lurePos].trialType !== "F") continue;
      if (trials[lurePos].usedAsSource) continue;
      candidates.push([pos, lurePos, lag]);
    }
  }
  rng.shuffle(candidates);
  const used = new Set<number>();
  let inserted = 0;
  for (const [pos, lurePos, lag] of candidates) {
    if (inserted >= nLures) break;
    if (used.has(pos) || used.has(lurePos)) continue;
    trials[pos].item = trials[lurePos].item;
    trials[pos].sourceCategory = trials[lurePos].sourceCategory;
    trials[pos].trialType = `L${lag}`;
    trials[pos].usedAsSource = true;
    trials[lurePos].usedAsSource = true;
    used.add(pos);
    used.add(lurePos);
    inserted += 1;
  }
  return inserted;
}

function validateNbackBlock(
  block: PlannedBlock,
  pmPositionSet: Set<number>,
  mapping: NbackMapping,
): void {
  const nonTargetResponseSpec = mapping.nonTargetKey ?? "timeout";
  for (let i = 0; i < block.trials.length; i += 1) {
    const trial = block.trials[i];
    const atPmSlot = pmPositionSet.has(i);
    if (block.blockType === "PM" && atPmSlot && mapping.pmKey) {
      if (trial.trialType !== "PM") {
        throw new Error(`NBack+PM integrity: block '${block.label}' trial ${i} should be PM-slot but is '${trial.trialType}'.`);
      }
      if (trial.correctResponse !== mapping.pmKey) {
        throw new Error(`NBack+PM integrity: block '${block.label}' trial ${i} PM-slot does not use pm key.`);
      }
    }
    if (block.blockType === "Control" && atPmSlot) {
      if (trial.trialType !== "F") {
        throw new Error(`NBack+PM integrity: block '${block.label}' control-slot trial ${i} must be filler.`);
      }
      if (trial.correctResponse !== nonTargetResponseSpec) {
        throw new Error(`NBack+PM integrity: block '${block.label}' control-slot trial ${i} must use non-target response.`);
      }
    }
    if (trial.trialType === "N" && trial.correctResponse !== mapping.targetKey) {
      throw new Error(`NBack integrity: block '${block.label}' trial ${i} N-target does not use targetKey.`);
    }
    if (trial.trialType === "F" && trial.correctResponse !== nonTargetResponseSpec) {
      throw new Error(`NBack integrity: block '${block.label}' trial ${i} filler has unexpected response spec.`);
    }
  }

  for (let i = 0; i < block.trials.length; i += 1) {
    const trial = block.trials[i];
    const backPos = i - block.nLevel;
    const hasNback = backPos >= 0;
    const nbackMatch = hasNback ? trial.item === block.trials[backPos].item : false;

    if (trial.trialType === "PM" && nbackMatch) {
      throw new Error(`NBack+PM integrity: block '${block.label}' trial ${i} PM trial also matches n-back.`);
    }
    if (trial.trialType === "N" && !nbackMatch) {
      throw new Error(`NBack integrity: block '${block.label}' trial ${i} marked N but does not match n-back.`);
    }
    if (trial.trialType === "F" && nbackMatch) {
      throw new Error(`NBack integrity: block '${block.label}' trial ${i} marked F but matches n-back.`);
    }
    if (trial.trialType.startsWith("L")) {
      const lag = Number.parseInt(trial.trialType.slice(1), 10);
      if (!Number.isInteger(lag) || lag <= 0 || lag === block.nLevel) {
        throw new Error(`NBack integrity: block '${block.label}' trial ${i} has invalid lure label '${trial.trialType}'.`);
      }
      const lurePos = i - lag;
      if (lurePos < 0 || trial.item !== block.trials[lurePos].item) {
        throw new Error(`NBack integrity: block '${block.label}' trial ${i} lure does not match lag ${lag}.`);
      }
      if (nbackMatch) {
        throw new Error(`NBack integrity: block '${block.label}' trial ${i} lure also matches n-back.`);
      }
    }
  }
}

function resolveStimulusPath(
  parsed: ParsedNbackConfig,
  block: PlannedBlock,
  itemId: string,
  trialIndex: number,
  resolver: VariableResolver,
): string {
  if (!parsed.imageAssets.enabled) return itemId;
  const variant = Math.max(1, block.stimulusVariant ?? parsed.imageAssets.practiceVariant);
  return resolveAssetPath({
    basePath: parsed.imageAssets.basePath,
    template: parsed.imageAssets.filenameTemplate,
    resolver,
    context: {
      blockIndex: block.blockIndex,
      trialIndex,
      locals: {
        itemId,
        stimulusVariant: variant,
        blockIndex: block.blockIndex,
        blockLabel: block.label,
        nLevel: block.nLevel,
      },
    },
  });
}

function resolveBlockStimulusVariant(
  parsed: ParsedNbackConfig,
  block: NbackBlockConfig,
  rng: SeededRandom,
  mainCycleIndex: number,
): number | null {
  if (!parsed.imageAssets.enabled) return null;
  if (block.stimulusVariant && block.stimulusVariant > 0) return block.stimulusVariant;
  if (block.isPractice) return parsed.imageAssets.practiceVariant;

  const mainVariants = parsed.imageAssets.mainVariants.length > 0 ? parsed.imageAssets.mainVariants : [1, 2];
  if (parsed.imageAssets.mainMode === "cycle") {
    return mainVariants[mainCycleIndex % mainVariants.length];
  }
  const pick = rng.int(0, mainVariants.length - 1);
  return mainVariants[pick];
}

async function preloadNbackStimulus(item: string): Promise<PreloadedStimulus> {
  const image = await loadImageIfLikelyVisualStimulus(item, NBACK_IMAGE_CACHE);
  return { image };
}

function drawSizedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  configuredWidth: number | null,
  configuredHeight: number | null,
  frameMaxWidth: number,
  frameMaxHeight: number,
  allowUpscale: boolean,
): void {
  const nativeWidth = image.naturalWidth || image.width;
  const nativeHeight = image.naturalHeight || image.height;
  if (!(nativeWidth > 0 && nativeHeight > 0)) return;

  const targetWidth = configuredWidth ?? nativeWidth;
  const targetHeight = configuredHeight ?? nativeHeight;

  const widthRatio = frameMaxWidth / targetWidth;
  const heightRatio = frameMaxHeight / targetHeight;
  let scale = Math.min(widthRatio, heightRatio);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  if (!allowUpscale) scale = Math.min(scale, 1);

  const drawWidth = Math.max(1, Math.floor(targetWidth * scale));
  const drawHeight = Math.max(1, Math.floor(targetHeight * scale));
  ctx.drawImage(
    image,
    Math.round(centerX - drawWidth / 2),
    Math.round(centerY - drawHeight / 2),
    drawWidth,
    drawHeight,
  );
}

function expandCategoryEntriesWithVariables(
  entries: string[],
  resolver: VariableResolver,
  context: { blockIndex: number },
): string[] {
  const flattenResolved = (value: unknown): string[] => {
    const resolved = resolver.resolveInValue(value, context);
    if (Array.isArray(resolved)) {
      return resolved.flatMap((entry) => flattenResolved(entry));
    }
    const parsed = asString(resolved);
    return parsed ? [parsed] : [];
  };
  const out: string[] = [];
  for (const entry of entries) {
    out.push(...flattenResolved(entry));
  }
  return out.length > 0 ? out : entries;
}

function parseLureLagPasses(value: unknown): number[][] {
  const rawPasses = asArray(value);
  if (rawPasses.length === 0) {
    return [[2, 4, 5], [6, 7, 8, 9]];
  }
  const parsed = rawPasses
    .map((pass) =>
      asArray(pass)
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0) as number[],
    )
    .filter((pass) => pass.length > 0);
  return parsed.length > 0 ? parsed : [[2, 4, 5], [6, 7, 8, 9]];
}
