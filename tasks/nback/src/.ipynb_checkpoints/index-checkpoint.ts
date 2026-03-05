import {
  SeededRandom,
  createEventLogger,
  escapeHtml,
  finalizeTaskRun,
  hashSeed,
  normalizeKey,
  computeCanvasFrameLayout,
  drawCanvasFramedScene,
  drawCanvasCenteredText,
  mountCanvasElement,
  ensureJsPsychCanvasCentered,
  pushJsPsychContinueScreen,
  resolveJsPsychContentHost,
  renderCenteredNotice,
  recordsToCsv,
  resolveRunnerPreference,
  toJsPsychChoices,
  waitForContinue,
  runWithRunner,
  runBlockTrialLoop,
  runPromptScreens,
  runTrialTimeline,
  resolveTemplate,
  createVariableResolver,
  loadStimuliPoolsFromCsv,
  loadImageIfLikelyVisualStimulus,
  resolveAssetPath,
  createManipulationOverrideMap,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  applyManipulationOverridesToBlock,
  asObject,
  asArray,
  asString,
  toPositiveNumber,
  toNonNegativeNumber,
  type JSONObject,
  type TaskAdapter,
  type TaskAdapterContext,
  type VariableResolver,
  type CsvSourceSpec,
} from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";

const adapter: TaskAdapter = {
  manifest: {
    taskId: "pm",
    label: "PM",
    variants: [
      { id: "modern", label: "NBack PM Modern", configPath: "pm/modern" },
      { id: "nirvanaExp1", label: "NBack PM Images", configPath: "pm/nirvanaExp1" },
      { id: "word_multicat", label: "NBack PM Word Multicat", configPath: "pm/word_multicat" },
    ],
  },
  async launch(context) {
    await runWithRunner({
      context,
      preferredRunner: resolveRunnerPreference(context.taskConfig),
      defaultRunner: "jspsych",
      runners: {
        native: runPmNativeTask,
        jspsych: runPmJsPsychTask,
      },
    });
  },
};

export const pmAdapter = adapter;

interface PmMapping {
  targetKey: string;
  nonTargetKey: string;
  pmKey: string;
}

interface PmTiming {
  trialDurationMs: number;
  fixationDurationMs: number;
  stimulusOnsetMs: number;
  responseWindowStartMs: number;
  responseWindowEndMs: number;
}

interface PmBlockConfig {
  label: string;
  blockType: "PM" | "Control";
  isPractice: boolean;
  nLevel: number;
  trials: number;
  activePmCategories: string[];
  nbackSourceCategories: string[];
  controlSourceCategories: string[];
  pmCount: number;
  targetCount: number;
  lureCount: number;
  minPmSeparation: number;
  maxPmSeparation: number;
  stimulusVariant: number | null;
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
}

interface ParsedPmConfig {
  title: string;
  mapping: PmMapping;
  timing: PmTiming;
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
  imageAssets: {
    enabled: boolean;
    basePath: string;
    filenameTemplate: string;
    practiceVariant: number;
    mainVariants: number[];
    mainMode: "with_replacement" | "cycle";
  };
  stimuliCsv: {
    basePath: string;
    defaultIdColumn: string;
    categories: Record<string, string | CsvSourceSpec>;
  } | null;
  variableDefinitions: Record<string, unknown>;
  allowedKeys: string[];
  instructions: {
    intro: string;
    pmTemplate: string;
    blockIntroControlTemplate: string;
    blockIntroPmTemplate: string;
  };
  pmCategories: string[];
  practiceBlocks: PmBlockConfig[];
  mainBlocks: PmBlockConfig[];
  stimuliByCategory: Record<string, string[]>;
  nbackRule: NbackRuleConfig;
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

interface TrialResponse {
  key: string | null;
  rtMs: number | null;
}

interface PreloadedStimulus {
  image: HTMLImageElement | null;
}

interface PmTrialEval {
  correct: number;
  responded: number;
}

const PM_IMAGE_CACHE = new Map<string, Promise<HTMLImageElement | null>>();

interface PmRuntimeState {
  parsed: ParsedPmConfig;
  plan: PlannedBlock[];
  variableResolver: VariableResolver;
  eventLogger: ReturnType<typeof createEventLogger>;
  participantId: string;
  variantId: string;
}

async function preparePmRuntime(context: TaskAdapterContext): Promise<PmRuntimeState> {
  const parsed = parsePmConfig(context.taskConfig, context.selection);
  const variableResolver = createPmVariableResolver(parsed, context);
  if (parsed.stimuliCsv) {
    parsed.stimuliByCategory = await loadStimuliFromCsv(parsed.stimuliCsv, parsed.stimuliByCategory, variableResolver);
  }
  applyPmVariableResolution(parsed, variableResolver);
  const rng = new SeededRandom(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId));
  const plan = buildExperimentPlan(parsed, rng);
  const eventLogger = createEventLogger(context.selection);
  return {
    parsed,
    plan,
    variableResolver,
    eventLogger,
    participantId: context.selection.participant.participantId,
    variantId: context.selection.variantId,
  };
}

async function runPmNativeTask(context: TaskAdapterContext): Promise<void> {
  const runtime = await preparePmRuntime(context);
  const { parsed, plan, eventLogger } = runtime;

  const records: TrialRecord[] = [];
  const root = context.container;
  root.style.maxWidth = "1000px";
  root.style.margin = "1rem auto";
  root.style.fontFamily = "system-ui";
  root.style.lineHeight = "1.4";
  eventLogger.emit("task_start", { task: "pm", runner: "native" });

  await runPromptScreens(root, [
    {
      html: `<h2>${escapeHtml(parsed.title)}</h2><p>Participant: <code>${escapeHtml(runtime.participantId)}</code></p>`,
      buttonId: "pm-continue-btn-1",
    },
    {
      html: `<p>${escapeHtml(parsed.instructions.intro)}</p><p>${escapeHtml(parsed.instructions.pmTemplate.replace("{pmCategoryText}", parsed.pmCategories.join(", ")))}</p>`,
      buttonId: "pm-continue-btn-2",
    },
  ]);

  await runBlockTrialLoop<PlannedBlock, PlannedTrial, PmTrialEval>({
    container: root,
    blocks: plan,
    renderBlockStart: ({ block, blockIndex }) => {
      eventLogger.emit("block_start", { label: block.label, blockType: block.blockType }, { blockIndex });
      const intro = block.blockType === "PM" ? parsed.instructions.blockIntroPmTemplate : parsed.instructions.blockIntroControlTemplate;
      const introText = intro
        .replace("{nLevel}", String(block.nLevel))
        .replace("{pmCategoryText}", block.activePmCategories.join(", "));
      return `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(introText)}</p>`;
    },
    blockStartButtonId: ({ block }) => `pm-continue-btn-block-${block.blockIndex}`,
    runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
      const resolvedStimulus = resolveStimulusPath(parsed, block, trial.item, trial.trialIndex, runtime.variableResolver);
      const response = await runTrial(root, parsed, block, trial, resolvedStimulus, parsed.timing, parsed.allowedKeys);
      const correct = response.key === trial.correctResponse ? 1 : 0;
      const responded = response.key ? 1 : 0;
      records.push(buildTrialRecord(runtime, block, trial, resolvedStimulus, response.key, response.rtMs));
      eventLogger.emit(
        "trial_complete",
        {
          blockType: block.blockType,
          trialType: trial.trialType,
          correct,
          responded,
          responseKey: response.key ?? "",
          rtMs: response.rtMs ?? -1,
        },
        { blockIndex, trialIndex },
      );
      return { correct, responded };
    },
    renderBlockEnd: ({ block, blockIndex, trialResults }) => {
      const blockCorrect = trialResults.reduce((acc, row) => acc + row.correct, 0);
      const blockResponded = trialResults.reduce((acc, row) => acc + row.responded, 0);
      const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
      eventLogger.emit(
        "block_end",
        { label: block.label, blockType: block.blockType, accuracy, responded: blockResponded },
        { blockIndex },
      );
      return `<h3>End of ${escapeHtml(block.label)}</h3><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p><p>Responses: <b>${blockResponded}</b> / ${block.trials.length}</p>`;
    },
    blockEndButtonId: ({ block }) => `pm-continue-btn-end-${block.blockIndex}`,
  });

  await finalizePmRun(context, runtime, records, { runner: "native" });
}

async function runPmJsPsychTask(context: TaskAdapterContext): Promise<void> {
  const runtime = await preparePmRuntime(context);
  const { parsed, plan, eventLogger } = runtime;
  const root = context.container;
  let jsPsychRef: ReturnType<typeof initJsPsych> | null = null;
  root.style.maxWidth = "1000px";
  root.style.margin = "1rem auto";
  root.style.fontFamily = "system-ui";
  root.style.lineHeight = "1.4";
  ensureJsPsychCanvasCentered(root);
  eventLogger.emit("task_start", { task: "pm", runner: "jspsych" });

  const timeline: any[] = [];
  pushJsPsychContinueScreen(
    timeline,
    CallFunctionPlugin,
    root,
    `<h2>${escapeHtml(parsed.title)}</h2><p>Participant: <code>${escapeHtml(runtime.participantId)}</code></p>`,
    "intro_start",
    "pm-continue-intro_start",
  );
  pushJsPsychContinueScreen(
    timeline,
    CallFunctionPlugin,
    root,
    `<p>${escapeHtml(parsed.instructions.intro)}</p><p>${escapeHtml(parsed.instructions.pmTemplate.replace("{pmCategoryText}", parsed.pmCategories.join(", ")))}</p>`,
    "intro_instructions",
    "pm-continue-intro_instructions",
  );

  for (const block of plan) {
    timeline.push({
      type: CallFunctionPlugin,
      data: { phase: "block_start_hook", blockIndex: block.blockIndex },
      func: () => {
        eventLogger.emit("block_start", { label: block.label, blockType: block.blockType }, { blockIndex: block.blockIndex });
      },
    });

    const intro = block.blockType === "PM" ? parsed.instructions.blockIntroPmTemplate : parsed.instructions.blockIntroControlTemplate;
    const introText = intro
      .replace("{nLevel}", String(block.nLevel))
      .replace("{pmCategoryText}", block.activePmCategories.join(", "));
    pushJsPsychContinueScreen(
      timeline,
      CallFunctionPlugin,
      root,
      `<h3>${escapeHtml(block.label)}</h3><p>${escapeHtml(introText)}</p>`,
      "block_start",
      `pm-continue-block_start-${block.blockIndex}`,
      { blockIndex: block.blockIndex },
    );

    for (const trial of block.trials) {
      const resolvedStimulus = resolveStimulusPath(parsed, block, trial.item, trial.trialIndex, runtime.variableResolver);
      const preloaded = await preloadPmStimulus(resolvedStimulus);
      appendJsPsychPmTrial({
        timeline,
        parsed,
        block,
        trial,
        resolvedStimulus,
        runtime,
        preloaded,
        eventLogger,
      });
    }

    timeline.push({
      type: CallFunctionPlugin,
      data: { phase: "block_end_hook", blockIndex: block.blockIndex },
      func: () => {
        const rows = getPmResponseRowsFromValues(jsPsychRef?.data.get().values() ?? [], block.blockIndex);
        const blockCorrect = rows.reduce((acc, row) => acc + row.responseCorrect, 0);
        const blockResponded = rows.reduce((acc, row) => acc + (row.responseKey ? 1 : 0), 0);
        const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
        eventLogger.emit(
          "block_end",
          { label: block.label, blockType: block.blockType, accuracy, responded: blockResponded },
          { blockIndex: block.blockIndex },
        );
      },
    });

    timeline.push({
      type: CallFunctionPlugin,
      data: { phase: "block_end", blockIndex: block.blockIndex },
      async: true,
      func: (done: () => void) => {
        const rows = getPmResponseRowsFromValues(jsPsychRef?.data.get().values() ?? [], block.blockIndex);
        const blockCorrect = rows.reduce((acc, row) => acc + row.responseCorrect, 0);
        const blockResponded = rows.reduce((acc, row) => acc + (row.responseKey ? 1 : 0), 0);
        const accuracy = block.trials.length > 0 ? Math.round((blockCorrect / block.trials.length) * 1000) / 10 : 0;
        const host = resolveJsPsychContentHost(root);
        void waitForContinue(
          host,
          `<h3>End of ${escapeHtml(block.label)}</h3><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p><p>Responses: <b>${blockResponded}</b> / ${block.trials.length}</p>`,
          { buttonId: `pm-end-${block.blockIndex}` },
        ).then(done);
      },
    });
  }

  jsPsychRef = initJsPsych({
    display_element: root,
  });
  await jsPsychRef.run(timeline);

  const records = collectPmRecords(jsPsychRef.data.get().values(), runtime.participantId, runtime.variantId);
  await finalizePmRun(context, runtime, records, { runner: "jspsych", jsPsychData: jsPsychRef.data.get().values() });
}

async function finalizePmRun(
  context: TaskAdapterContext,
  runtime: PmRuntimeState,
  records: TrialRecord[],
  extras: Record<string, unknown>,
): Promise<void> {
  runtime.eventLogger.emit("task_complete", { task: "pm", runner: extras.runner ?? "unknown", nTrials: records.length });
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
    csv: { contents: recordsToCsv(records), suffix: "pm" },
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
    title: "PM complete",
    message: "Data saved locally.",
  });
}

function appendJsPsychPmTrial(args: {
  timeline: any[];
  parsed: ParsedPmConfig;
  block: PlannedBlock;
  trial: PlannedTrial;
  resolvedStimulus: string;
  runtime: PmRuntimeState;
  preloaded: PreloadedStimulus;
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, parsed, block, trial, resolvedStimulus, runtime, preloaded, eventLogger } = args;
  const { timing, allowedKeys } = parsed;
  const layout = computeCanvasFrameLayout({
    aperturePx: parsed.display.aperturePx,
    paddingYPx: parsed.display.paddingYPx,
    cueHeightPx: parsed.display.cueHeightPx,
    cueMarginBottomPx: parsed.display.cueMarginBottomPx,
  });
  const jsPsychAllowedKeys = toJsPsychChoices(allowedKeys);

  const trialDuration = Math.max(0, timing.trialDurationMs);
  const fixationEnd = Math.max(0, Math.min(trialDuration, timing.fixationDurationMs));
  const stimStart = Math.max(0, Math.min(trialDuration, timing.stimulusOnsetMs));
  const responseStart = Math.max(0, Math.min(trialDuration, timing.responseWindowStartMs));
  const responseEnd = Math.max(responseStart, Math.min(trialDuration, timing.responseWindowEndMs));

  const fixationMs = fixationEnd;
  const blankMs = Math.max(0, stimStart - fixationEnd);
  const preResponseMs = Math.max(0, responseStart - stimStart);
  const responseMs = Math.max(0, responseEnd - responseStart);
  const postResponseMs = Math.max(0, trialDuration - responseEnd);

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

  if (fixationMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: true, showStimulus: false });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: fixationMs,
      data: { ...baseData, phase: "pm_fixation" },
    });
  }

  if (blankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: false });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: blankMs,
      data: { ...baseData, phase: "pm_blank" },
    });
  }

  if (preResponseMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: preResponseMs,
      data: { ...baseData, phase: "pm_stimulus_pre_response" },
    });
  }

  timeline.push({
    type: CanvasKeyboardResponsePlugin,
    stimulus: (canvas: HTMLCanvasElement) => {
      drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
    },
    canvas_size: [layout.totalHeightPx, layout.aperturePx],
    choices: responseMs > 0 ? jsPsychAllowedKeys : "NO_KEYS",
    response_ends_trial: false,
    trial_duration: responseMs,
    data: { ...baseData, phase: "pm_response_window" },
    on_finish: (data: Record<string, unknown>) => {
      const key = typeof data.response === "string" ? normalizeKey(data.response) : null;
      const rt = typeof data.rt === "number" && Number.isFinite(data.rt) ? data.rt : null;
      const correct = key === normalizeKey(trial.correctResponse) ? 1 : 0;
      const responded = key ? 1 : 0;
      Object.assign(data, {
        responseKey: key ?? "",
        responseRtMs: rt ?? -1,
        responseCorrect: correct,
      });
      eventLogger.emit(
        "trial_complete",
        {
          blockType: block.blockType,
          trialType: trial.trialType,
          correct,
          responded,
          responseKey: key ?? "",
          rtMs: rt ?? -1,
        },
        { blockIndex: block.blockIndex, trialIndex: trial.trialIndex },
      );
    },
  });

  if (postResponseMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        drawPmPhase(canvas, layout, parsed, preloaded, trial, { showFixation: false, showStimulus: true });
      },
      canvas_size: [layout.totalHeightPx, layout.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: postResponseMs,
      data: { ...baseData, phase: "pm_post_response" },
    });
  }
}

function drawPmPhase(
  canvas: HTMLCanvasElement,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  parsed: ParsedPmConfig,
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

function buildTrialRecord(
  runtime: PmRuntimeState,
  block: PlannedBlock,
  trial: PlannedTrial,
  stimulusPath: string,
  responseKey: string | null,
  responseRtMs: number | null,
): TrialRecord {
  const correct = responseKey === trial.correctResponse ? 1 : 0;
  return {
    participantId: runtime.participantId,
    variantId: runtime.variantId,
    blockLabel: block.label,
    blockIndex: block.blockIndex,
    blockType: block.blockType,
    nLevel: block.nLevel,
    trialIndex: trial.trialIndex,
    trialType: trial.trialType,
    item: trial.item,
    stimulusPath,
    stimulusVariant: block.stimulusVariant ?? -1,
    sourceCategory: trial.sourceCategory,
    itemCategory: trial.itemCategory,
    correctResponse: trial.correctResponse,
    responseKey: responseKey ?? "",
    responseRtMs: responseRtMs ?? -1,
    responseCorrect: correct,
  };
}

function collectPmRecords(rows: Array<Record<string, unknown>>, participantId: string, variantId: string): TrialRecord[] {
  const output: TrialRecord[] = [];
  for (const row of rows) {
    if (row.phase !== "pm_response_window") continue;
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

function getPmResponseRowsFromValues(rows: Array<Record<string, unknown>>, blockIndex: number): TrialRecord[] {
  return collectPmRecords(rows, "", "").filter((row) => row.blockIndex === blockIndex);
}

function parsePmConfig(config: JSONObject, selection?: TaskAdapterContext["selection"]): ParsedPmConfig {
  const mappingRaw = asObject(config.mapping);
  const targetKey = normalizeKey(asString(mappingRaw?.targetKey) || "m");
  const nonTargetKey = normalizeKey(asString(mappingRaw?.nonTargetKey) || "z");
  const pmKey = normalizeKey(asString(mappingRaw?.pmKey) || "space");
  const distinct = new Set([targetKey, nonTargetKey, pmKey]);
  if (distinct.size < 3) throw new Error("Invalid PM mapping: target/nonTarget/pm keys must be distinct.");

  const timingRaw = asObject(config.timing);
  const timing: PmTiming = {
    trialDurationMs: toPositiveNumber(timingRaw?.trialDurationMs, 5000),
    fixationDurationMs: toNonNegativeNumber(timingRaw?.fixationDurationMs, 500),
    stimulusOnsetMs: toNonNegativeNumber(timingRaw?.stimulusOnsetMs, 1000),
    responseWindowStartMs: toNonNegativeNumber(timingRaw?.responseWindowStartMs, 1000),
    responseWindowEndMs: toNonNegativeNumber(timingRaw?.responseWindowEndMs, 5000),
  };
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

  const plan = asObject(config.plan);
  const nbackRuleRaw = asObject(config.nbackRule);
  const imageAssetsRaw = asObject(config.imageAssets);
  const stimuliCsvRaw = asObject(config.stimuliCsv);
  const configVariables = asObject(config.variables);
  const taskVariables = asObject(asObject(config.task)?.variables);
  const variableDefinitions = {
    ...(taskVariables ?? {}),
    ...(configVariables ?? {}),
  };
  const planVariableResolver = createVariableResolver({
    variables: variableDefinitions,
    seedParts: selection
      ? [
          selection.participant.participantId,
          selection.participant.sessionId,
          selection.variantId,
          "pm_variables",
        ]
      : ["pm_variables"],
  });
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
          "pm_plan_manipulation_pools",
        ]
      : ["pm_plan_manipulation_pools"],
  );
  const mergedBlocks = asArray(plan?.blocks).map((entry, index) =>
    parseBlock(
      applyManipulationOverridesToBlock(
        entry,
        resolveBlockManipulationIds(entry, planPoolAllocator),
        planManipulations,
        `Invalid PM plan: block ${index + 1}`,
      ),
      index,
      null,
      planVariableResolver,
    ),
  );
  const parsedPracticeBlocks = mergedBlocks.filter((block) => block.isPractice);
  const parsedMainBlocks = mergedBlocks.filter((block) => !block.isPractice);
  if (mergedBlocks.length === 0) throw new Error("Invalid PM plan: plan.blocks is empty.");

  const stimuliByCategory = parseStimulusPools(config);
  const pmCategories = Array.from(new Set(mergedBlocks.flatMap((b) => b.activePmCategories)));
  const instructionsRaw = asObject(config.instructions);
  const completeRaw = asObject(config.completion);
  const redirectRaw = asObject(completeRaw?.redirect);

  return {
    title: asString(asObject(config.task)?.title) || "PM Task",
    mapping: { targetKey, nonTargetKey, pmKey },
    timing,
    display,
    imageAssets: {
      enabled: imageAssetsRaw?.enabled === true,
      basePath: asString(imageAssetsRaw?.basePath) || "",
      filenameTemplate: asString(imageAssetsRaw?.filenameTemplate) || "{id}",
      practiceVariant: toPositiveNumber(imageAssetsRaw?.practiceVariant, 1),
      mainVariants: readPositiveNumberArray(imageAssetsRaw?.mainVariants, [1]),
      mainMode: (asString(imageAssetsRaw?.mainMode) || "with_replacement").toLowerCase() === "cycle" ? "cycle" : "with_replacement",
    },
    stimuliCsv: parseStimuliCsvConfig(stimuliCsvRaw),
    variableDefinitions,
    allowedKeys: [targetKey, nonTargetKey, pmKey],
    pmCategories,
    instructions: {
      intro:
        asString(instructionsRaw?.intro) ||
        "Respond M for n-back targets, Z for non-targets, and SPACE for PM items.",
      pmTemplate:
        asString(instructionsRaw?.pmTemplate) ||
        "PM categories for this session: {pmCategoryText}",
      blockIntroControlTemplate:
        asString(instructionsRaw?.blockIntroControlTemplate) ||
        "This is a {nLevel}-back block. There are no PM trials in this block.",
      blockIntroPmTemplate:
        asString(instructionsRaw?.blockIntroPmTemplate) ||
        "This is a {nLevel}-back PM block. Watch for {pmCategoryText}.",
    },
    practiceBlocks: parsedPracticeBlocks,
    mainBlocks: parsedMainBlocks,
    stimuliByCategory,
    nbackRule: {
      lureLagPasses,
      maxInsertionAttempts,
    },
    redirectCompleteTemplate: asString(redirectRaw?.completeUrlTemplate) || "",
  };
}

function parseBlock(
  entry: unknown,
  index: number,
  isPractice: boolean | null,
  variableResolver?: VariableResolver,
): PmBlockConfig {
  const b = asObject(entry);
  if (!b) throw new Error(`Invalid PM plan: block ${index + 1} is not an object.`);
  const scope = { blockIndex: index };
  const resolvedPhase = variableResolver ? variableResolver.resolveToken(b.phase, scope) : b.phase;
  const phaseRaw = (asString(resolvedPhase) || "").toLowerCase();
  const resolvedIsPractice = variableResolver ? variableResolver.resolveToken(b.isPractice, scope) : b.isPractice;
  const inferredPractice = typeof resolvedIsPractice === "boolean" ? resolvedIsPractice : phaseRaw === "practice";
  const isPracticeResolved = isPractice ?? inferredPractice;
  const resolvedLabel = variableResolver ? variableResolver.resolveToken(b.label, scope) : b.label;
  const label = asString(resolvedLabel) || `${isPracticeResolved ? "Practice" : "Block"} ${index + 1}`;
  const resolvedBlockType = variableResolver ? variableResolver.resolveToken(b.blockType, scope) : b.blockType;
  const rawType = (asString(resolvedBlockType) || "control").toLowerCase();
  if (rawType !== "pm" && rawType !== "control") throw new Error(`Invalid PM plan: block '${label}' has invalid blockType.`);
  const blockType: "PM" | "Control" = rawType === "pm" ? "PM" : "Control";
  const resolvedTrials = variableResolver ? variableResolver.resolveToken(b.trials, scope) : b.trials;
  const trials = toPositiveNumber(resolvedTrials, isPracticeResolved ? 20 : 54);
  const resolvedNLevel = variableResolver ? variableResolver.resolveToken(b.nLevel, scope) : b.nLevel;
  const nLevel = toPositiveNumber(resolvedNLevel, isPracticeResolved ? 2 : 1);

  const activePmCategories = readStringArray(b.activePmCategories, ["pm"]);
  const nbackSourceCategories = readStringArray(b.nbackSourceCategories, ["other"]);
  const controlSourceCategories = readStringArray(b.controlSourceCategories, []);
  const resolvedPmCount = variableResolver ? variableResolver.resolveToken(b.pmCount, scope) : b.pmCount;
  const resolvedTargetCount = variableResolver ? variableResolver.resolveToken(b.targetCount, scope) : b.targetCount;
  const resolvedLureCount = variableResolver ? variableResolver.resolveToken(b.lureCount, scope) : b.lureCount;
  const resolvedMinPmSep = variableResolver ? variableResolver.resolveToken(b.minPmSeparation, scope) : b.minPmSeparation;
  const resolvedMaxPmSep = variableResolver ? variableResolver.resolveToken(b.maxPmSeparation, scope) : b.maxPmSeparation;
  const resolvedStimulusVariant = variableResolver ? variableResolver.resolveToken(b.stimulusVariant, scope) : b.stimulusVariant;

  return {
    label,
    blockType,
    isPractice: isPracticeResolved,
    nLevel,
    trials,
    activePmCategories,
    nbackSourceCategories,
    controlSourceCategories,
    pmCount: toNonNegativeNumber(resolvedPmCount, isPracticeResolved ? 2 : 5),
    targetCount: toNonNegativeNumber(resolvedTargetCount, isPracticeResolved ? 6 : 18),
    lureCount: toNonNegativeNumber(resolvedLureCount, isPracticeResolved ? 3 : 18),
    minPmSeparation: toPositiveNumber(resolvedMinPmSep, 8),
    maxPmSeparation: toPositiveNumber(resolvedMaxPmSep, 11),
    stimulusVariant: Number.isFinite(Number(resolvedStimulusVariant))
      ? Math.max(1, Math.floor(Number(resolvedStimulusVariant)))
      : null,
  };
}

function parseStimulusPools(config: JSONObject): Record<string, string[]> {
  const stimuliRaw = asObject(config.stimuli);
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

function buildExperimentPlan(config: ParsedPmConfig, rng: SeededRandom): PlannedBlock[] {
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
  block: PmBlockConfig,
  blockIndex: number,
  config: ParsedPmConfig,
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
  throw new Error(`Failed to generate valid PM block '${block.label}' after ${maxAttempts} attempts: ${lastError?.message ?? "unknown error"}`);
}

function buildBlockPlanAttempt(
  block: PmBlockConfig,
  blockIndex: number,
  config: ParsedPmConfig,
  rng: SeededRandom,
  stimulusVariant: number | null,
): PlannedBlock {
  const effectivePmCount =
    block.blockType === "Control" && block.controlSourceCategories.length === 0
      ? 0
      : block.pmCount;
  const pmPositions = generatePmPositions(rng, block.trials, effectivePmCount, block.minPmSeparation, block.maxPmSeparation);
  const pmPositionSet = new Set(pmPositions);

  const excluded = new Set([...block.activePmCategories, ...block.controlSourceCategories]);
  const nbackCandidates = collectCategoryItems(config.stimuliByCategory, block.nbackSourceCategories, excluded);
  if (nbackCandidates.length === 0) {
    nbackCandidates.push(...collectCategoryItems(config.stimuliByCategory, ["other"], new Set<string>()));
  }
  if (nbackCandidates.length === 0) throw new Error(`Block '${block.label}' has no n-back candidate items.`);

  const drawPm = createCyclingDrawer(config.stimuliByCategory, block.blockType === "PM" ? block.activePmCategories : block.controlSourceCategories, rng);
  const drawNback = createDrawerFromCandidates(nbackCandidates, rng);
  const trials: PlannedTrial[] = [];

  for (let i = 0; i < block.trials; i += 1) {
    if (pmPositionSet.has(i)) {
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
        correctResponse: config.mapping.nonTargetKey,
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
      trial.correctResponse = config.mapping.nonTargetKey;
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
  };
  validatePmBlock(planned, pmPositionSet, config.mapping);
  return planned;
}

function generatePmPositions(rng: SeededRandom, nTrials: number, nPm: number, minSep: number, maxSep: number): number[] {
  if (nPm <= 0) return [];
  if (minSep <= 0 || maxSep < minSep) throw new Error("Invalid PM separation settings.");
  if (nPm * minSep > nTrials - 1) throw new Error(`Cannot place ${nPm} PM trials in ${nTrials} trials.`);
  const positions: number[] = [];
  let lastPos = 0;
  for (let i = 0; i < nPm; i += 1) {
    const remaining = nPm - i - 1;
    const minPos = lastPos + minSep;
    const latestByMaxGap = lastPos + maxSep;
    const latestByRemaining = nTrials - 1 - remaining * minSep;
    const maxPos = Math.min(latestByMaxGap, latestByRemaining);
    if (minPos > maxPos) throw new Error(`Cannot place PM trial ${i + 1}/${nPm}.`);
    const pos = rng.int(minPos, maxPos);
    positions.push(pos);
    lastPos = pos;
  }
  return positions;
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

function validatePmBlock(
  block: PlannedBlock,
  pmPositionSet: Set<number>,
  mapping: PmMapping,
): void {
  for (let i = 0; i < block.trials.length; i += 1) {
    const trial = block.trials[i];
    const atPmSlot = pmPositionSet.has(i);

    if (block.blockType === "PM" && atPmSlot) {
      if (trial.trialType !== "PM") {
        throw new Error(`PM integrity: block '${block.label}' trial ${i} should be PM-slot but is '${trial.trialType}'.`);
      }
      if (trial.correctResponse !== mapping.pmKey) {
        throw new Error(`PM integrity: block '${block.label}' trial ${i} PM-slot does not use pmKey.`);
      }
    }

    if (block.blockType === "Control" && atPmSlot) {
      if (trial.trialType !== "F") {
        throw new Error(`PM integrity: block '${block.label}' control-slot trial ${i} must be filler after remap.`);
      }
      if (trial.correctResponse !== mapping.nonTargetKey) {
        throw new Error(`PM integrity: block '${block.label}' control-slot trial ${i} must use nonTargetKey.`);
      }
    }

    if (trial.trialType === "N" && trial.correctResponse !== mapping.targetKey) {
      throw new Error(`PM integrity: block '${block.label}' trial ${i} N-target does not use targetKey.`);
    }
    if (trial.trialType === "F" && trial.correctResponse !== mapping.nonTargetKey) {
      throw new Error(`PM integrity: block '${block.label}' trial ${i} filler does not use nonTargetKey.`);
    }
  }

  for (let i = 0; i < block.trials.length; i += 1) {
    const trial = block.trials[i];
    const backPos = i - block.nLevel;
    const hasNback = backPos >= 0;
    const nbackMatch = hasNback ? trial.item === block.trials[backPos].item : false;

    if (trial.trialType === "PM" && nbackMatch) {
      throw new Error(`PM integrity: block '${block.label}' trial ${i} is PM but also n-back match.`);
    }
    if (trial.trialType === "N" && !nbackMatch) {
      throw new Error(`PM integrity: block '${block.label}' trial ${i} marked N but does not match n-back.`);
    }
    if (trial.trialType === "F" && nbackMatch) {
      throw new Error(`PM integrity: block '${block.label}' trial ${i} marked F but matches n-back.`);
    }
    if (trial.trialType.startsWith("L")) {
      const lag = Number.parseInt(trial.trialType.slice(1), 10);
      if (!Number.isInteger(lag) || lag <= 0 || lag === block.nLevel) {
        throw new Error(`PM integrity: block '${block.label}' trial ${i} has invalid lure label '${trial.trialType}'.`);
      }
      const lurePos = i - lag;
      if (lurePos < 0 || trial.item !== block.trials[lurePos].item) {
        throw new Error(`PM integrity: block '${block.label}' trial ${i} lure does not match lag ${lag}.`);
      }
      if (nbackMatch) {
        throw new Error(`PM integrity: block '${block.label}' trial ${i} lure also matches n-back.`);
      }
    }
  }
}

function collectCategoryItems(
  pools: Record<string, string[]>,
  categories: string[],
  excludedCategories: Set<string>,
): Array<{ item: string; category: string }> {
  const out: Array<{ item: string; category: string }> = [];
  for (const category of categories) {
    if (excludedCategories.has(category)) continue;
    const items = pools[category] ?? [];
    for (const item of items) out.push({ item, category });
  }
  return out;
}

function createCyclingDrawer(
  pools: Record<string, string[]>,
  categories: string[],
  rng: SeededRandom,
): () => { item: string; category: string } {
  const valid = categories.filter((category) => (pools[category] ?? []).length > 0);
  if (valid.length === 0) {
    const fallback = Object.entries(pools).find(([, items]) => items.length > 0);
    if (!fallback) throw new Error("No available stimulus pools.");
    return () => ({ item: fallback[1][rng.int(0, fallback[1].length - 1)], category: fallback[0] });
  }
  const perCategory = new Map<string, string[]>();
  const perIndex = new Map<string, number>();
  for (const category of valid) {
    const copy = [...(pools[category] ?? [])];
    rng.shuffle(copy);
    perCategory.set(category, copy);
    perIndex.set(category, 0);
  }
  let categoryIndex = 0;
  return () => {
    const category = valid[categoryIndex % valid.length];
    categoryIndex += 1;
    const pool = perCategory.get(category) ?? [];
    let index = perIndex.get(category) ?? 0;
    if (index >= pool.length) {
      rng.shuffle(pool);
      index = 0;
    }
    perIndex.set(category, index + 1);
    return { item: pool[index], category };
  };
}

function createDrawerFromCandidates(
  candidates: Array<{ item: string; category: string }>,
  rng: SeededRandom,
): () => { item: string; category: string } {
  const pool = [...candidates];
  if (pool.length === 0) throw new Error("No stimulus candidates available.");
  rng.shuffle(pool);
  let index = 0;
  return () => {
    if (index >= pool.length) {
      rng.shuffle(pool);
      index = 0;
    }
    const picked = pool[index];
    index += 1;
    return picked;
  };
}

async function runTrial(
  container: HTMLElement,
  parsed: ParsedPmConfig,
  block: PlannedBlock,
  trial: PlannedTrial,
  resolvedStimulus: string,
  timing: PmTiming,
  allowedKeys: string[],
): Promise<TrialResponse> {
  const preloaded = await preloadPmStimulus(resolvedStimulus);
  const fixationMs = Math.max(0, timing.fixationDurationMs);
  const blankMs = Math.max(0, timing.stimulusOnsetMs - timing.fixationDurationMs);
  const stimulusMs = Math.max(0, timing.trialDurationMs - timing.stimulusOnsetMs);
  const layout = computeCanvasFrameLayout({
    aperturePx: parsed.display.aperturePx,
    paddingYPx: parsed.display.paddingYPx,
    cueHeightPx: parsed.display.cueHeightPx,
    cueMarginBottomPx: parsed.display.cueMarginBottomPx,
  });
  const { ctx } = mountCanvasElement({
    container,
    width: layout.aperturePx,
    height: layout.totalHeightPx,
    wrapperClassName: "pm-canvas-wrapper",
    canvasClassName: "pm-canvas",
  });

  const drawBaseFrame = (drawContent?: (centerX: number, centerY: number, frameSize: number) => void) => {
    drawCanvasFramedScene(
      ctx,
      layout,
      {
        cueText: "",
        frameBackground: parsed.display.frameBackground,
        frameBorder: parsed.display.frameBorder,
      },
      ({ centerX, centerY, frameSize }) => {
        drawContent?.(centerX, centerY, frameSize);
      },
    );
  };

  const result = await runTrialTimeline({
    container,
    stages: [
      {
        id: "fixation",
        durationMs: fixationMs,
        render: () => {
          drawBaseFrame((centerX, centerY) => {
            drawCanvasCenteredText(ctx, centerX, centerY, "+", {
              color: parsed.display.textColor,
              fontSizePx: parsed.display.fixationFontSizePx,
              fontWeight: parsed.display.fixationFontWeight,
            });
          });
        },
      },
      {
        id: "blank",
        durationMs: blankMs,
        render: () => {
          drawBaseFrame();
        },
      },
      {
        id: "stimulus",
        durationMs: stimulusMs,
        render: () => {
          drawBaseFrame((centerX, centerY, frameSize) => {
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
          });
        },
      },
    ],
    response: {
      allowedKeys,
      startMs: Math.max(0, timing.responseWindowStartMs),
      endMs: Math.max(0, timing.responseWindowEndMs),
    },
  });
  return { key: result.key, rtMs: result.rtMs };
}

function resolveStimulusPath(
  parsed: ParsedPmConfig,
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
  parsed: ParsedPmConfig,
  block: PmBlockConfig,
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

function parseStimuliCsvConfig(value: Record<string, unknown> | null): ParsedPmConfig["stimuliCsv"] {
  if (!value) return null;
  const categoriesRaw = asObject(value.categories);
  if (!categoriesRaw) return null;
  const categories: Record<string, string | CsvSourceSpec> = {};
  for (const [category, specLike] of Object.entries(categoriesRaw)) {
    const pathAsString = asString(specLike);
    if (pathAsString) {
      categories[category] = pathAsString;
      continue;
    }
    const specObj = asObject(specLike);
    if (!specObj) continue;
    const path = asString(specObj.path);
    if (!path) continue;
    const column = asString(specObj.column);
    const idColumn = asString(specObj.idColumn);
    categories[category] = { path, ...(column ? { column } : {}), ...(idColumn ? { idColumn } : {}) };
  }
  if (Object.keys(categories).length === 0) return null;
  return {
    basePath: asString(value.basePath) || "",
    defaultIdColumn: asString(value.idColumn) || asString(value.defaultIdColumn) || "file",
    categories,
  };
}

async function loadStimuliFromCsv(
  spec: NonNullable<ParsedPmConfig["stimuliCsv"]>,
  existing: Record<string, string[]>,
  resolver: VariableResolver,
): Promise<Record<string, string[]>> {
  const loaded = await loadStimuliPoolsFromCsv(
    {
      basePath: spec.basePath,
      defaultIdColumn: spec.defaultIdColumn,
      categories: spec.categories,
    },
    resolver,
  );
  const out: Record<string, string[]> = { ...existing };
  for (const [category, values] of Object.entries(loaded)) {
    if (values.length > 0) out[category] = values;
  }
  return out;
}

async function preloadPmStimulus(item: string): Promise<PreloadedStimulus> {
  const image = await loadImageIfLikelyVisualStimulus(item, PM_IMAGE_CACHE);
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

function readStringArray(value: unknown, fallback: string[]): string[] {
  const list = asArray(value).map((item) => asString(item)).filter((item): item is string => Boolean(item));
  return list.length > 0 ? list : [...fallback];
}

function readPositiveNumberArray(value: unknown, fallback: number[]): number[] {
  const list = asArray(value)
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.floor(entry));
  return list.length > 0 ? list : [...fallback];
}

function createPmVariableResolver(parsed: ParsedPmConfig, context: TaskAdapterContext): VariableResolver {
  return createVariableResolver({
    variables: parsed.variableDefinitions,
    seedParts: [
      context.selection.participant.participantId,
      context.selection.participant.sessionId,
      context.selection.variantId,
      "pm_variables",
    ],
  });
}

function applyPmVariableResolution(parsed: ParsedPmConfig, resolver: VariableResolver): void {
  const blocks = [...parsed.practiceBlocks, ...parsed.mainBlocks];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const scope = { blockIndex };
    block.activePmCategories = expandCategoryEntriesWithVariables(block.activePmCategories, resolver, scope);
    block.controlSourceCategories = expandCategoryEntriesWithVariables(block.controlSourceCategories, resolver, scope);
    block.nbackSourceCategories = expandCategoryEntriesWithVariables(block.nbackSourceCategories, resolver, scope);
  }

  const referencedCategories = blocks.flatMap((block) => [
    ...block.activePmCategories,
    ...block.controlSourceCategories,
    ...block.nbackSourceCategories,
  ]);
  ensureStimulusCategories(parsed.stimuliByCategory, referencedCategories);
  parsed.pmCategories = Array.from(new Set(blocks.flatMap((block) => block.activePmCategories)));
}

function expandCategoryEntriesWithVariables(
  entries: string[],
  resolver: VariableResolver,
  context: { blockIndex: number },
): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    const resolved = resolver.resolveToken(entry, context);
    if (Array.isArray(resolved)) {
      for (const value of resolved) {
        const parsed = asString(value);
        if (parsed) out.push(parsed);
      }
      continue;
    }
    const parsed = asString(resolved);
    if (parsed) {
      out.push(parsed);
    }
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
