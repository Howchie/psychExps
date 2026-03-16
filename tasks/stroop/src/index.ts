import {
  asArray,
  asObject,
  asString,
  buildConditionSequence,
  computeCanvasFrameLayout,
  computeRtPhaseDurations,
  createColorRegistry,
  createConditionCellId,
  createEventLogger,
  createMulberry32,
  createSemanticResolver,
  createResponseSemantics,
  drawCanvasCenteredText,
  drawCanvasFramedScene,
  drawTrialFeedbackOnCanvas,
  escapeHtml,
  evaluateTrialOutcome,
  hashSeed,
  TaskEnvironmentGuard,
  loadCsvDictionary,
  loadTokenPool,
  normalizeKey,
  parseTrialFeedbackConfig,
  buildTaskInstructionConfig,
  resolveTrialFeedbackView,
  runJsPsychTimeline,
  setCursorHidden,
  shouldHideCursorForPhase,
  extractJsPsychTrialResponse,
  computeAccuracy,
  TaskOrchestrator,
  createInstructionRenderer,
  StandardTaskInstructionConfig,
  toJsPsychChoices,
  toNonNegativeNumber,
  toPositiveNumber,
  toStringScreens,
  ensureJsPsychCanvasCentered,
  maybeExportStimulusRows,
  applyTaskInstructionConfig,
  createTaskAdapter,
  buildJsPsychRtTimelineNodes,
  type JSONObject,
  type RtTiming,
  type TaskAdapterContext,
  type TrialFeedbackConfig,
  type ResponseSemantics,
} from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";

type StroopMode = "congruence" | "valence";
type StroopCondition = "congruent" | "incongruent" | "neutral" | "positive" | "negative";

interface ParsedStroopConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  mode: StroopMode;
  mapping: {
    redKey: string;
    greenKey: string;
  };
  responseSemantics: ResponseSemantics;
  allowedKeys: string[];
  responseColorTokens: string[];
  rtTask: {
    timing: RtTiming;
    responseTerminatesTrial: boolean;
    postResponseContent: "stimulus" | "blank";
    feedbackPhase: "separate" | "post_response";
  };
  display: {
    aperturePx: number;
    paddingYPx: number;
    cueHeightPx: number;
    cueMarginBottomPx: number;
    frameBackground: string;
    frameBorder: string;
    cueColor: string;
    fixationColor: string;
    fixationFontSizePx: number;
    fixationFontWeight: number;
    stimulusFontSizePx: number;
    stimulusFontWeight: number;
    textColorByToken: Record<string, string>;
  };
  feedbackDefaults: TrialFeedbackConfig;
  conditions: {
    labels: StroopCondition[];
    quotaPerBlock: Record<string, number>;
    fontColorQuotaPerBlock: Record<string, number>;
    maxConditionRunLength: number;
    noImmediateWordRepeat: boolean;
  };
  words: string[];
  wordColorResolver: ReturnType<typeof createSemanticResolver>;
  valenceResolver: ReturnType<typeof createSemanticResolver>;
  blocks: Array<{
    id: string;
    label: string;
    trials: number;
    feedback: TrialFeedbackConfig;
    beforeBlockScreens: string[];
    afterBlockScreens: string[];
  }>;
}

interface PlannedTrial {
  id: string;
  trialIndex: number;
  word: string;
  fontColorToken: string;
  fontColorHex: string;
  conditionLabel: StroopCondition;
  wordColorToken: string | null;
  valence: string | null;
  correctResponse: string;
}

interface PlannedBlock {
  id: string;
  label: string;
  trials: PlannedTrial[];
  feedback: TrialFeedbackConfig;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
}

interface TrialRecord {
  participantId: string;
  variantId: string;
  mode: StroopMode;
  blockId: string;
  blockLabel: string;
  blockIndex: number;
  trialId: string;
  trialIndex: number;
  word: string;
  wordColorToken: string;
  valence: string;
  fontColorToken: string;
  fontColorHex: string;
  conditionLabel: string;
  correctResponse: string;
  responseKey: string;
  responseRtMs: number;
  responseCorrect: number;
}

const stroopManifest = {
  taskId: "stroop",
  label: "Stroop",
  variants: [
    { id: "default", label: "Classic Congruence", configPath: "stroop/default" },
    { id: "arbitrary_words", label: "Arbitrary Word Pool", configPath: "stroop/arbitrary_words" },
    { id: "emotional_valence", label: "Emotional Stroop", configPath: "stroop/emotional_valence" },
  ],
};

const stroopEnvironment = new TaskEnvironmentGuard();

export const stroopAdapter = createTaskAdapter({
  manifest: stroopManifest,
  run: runStroopTask,
  terminate: async () => {
    stroopEnvironment.cleanup();
  },
});

async function runStroopTask(context: TaskAdapterContext): Promise<unknown> {
  const parsed = await parseStroopConfig(context.taskConfig);
  const selection = context.selection;
  const participantId = selection.participant.participantId;
  const baseRng = createMulberry32(hashSeed(participantId, selection.participant.sessionId, selection.variantId, "stroop"));
  const records: TrialRecord[] = [];
  const root = context.container;
  const eventLogger = createEventLogger(selection);
  const plannedBlocks = buildStroopPlan(parsed, baseRng);

  const rows = plannedBlocks.flatMap((block, blockIndex) =>
    block.trials.map((trial) => ({
      block_index: blockIndex,
      block_id: block.id,
      block_label: block.label,
      trial_index: trial.trialIndex,
      trial_id: trial.id,
      word: trial.word,
      font_color_token: trial.fontColorToken,
      condition_label: trial.conditionLabel,
      trial_code: trial.conditionLabel,
      correct_response: trial.correctResponse,
    })),
  );
  const stimulusExport = await maybeExportStimulusRows({
    context,
    rows,
    suffix: "stroop_stimulus_list",
  });
  if (stimulusExport) return stimulusExport;

  root.style.maxWidth = "980px";
  root.style.margin = "0 auto";
  root.style.fontFamily = "system-ui";
  ensureJsPsychCanvasCentered(root);

  stroopEnvironment.installKeyScrollBlocker(parsed.allowedKeys);

  let jsPsych: ReturnType<typeof initJsPsych> | null = null;
  const orchestrator = new TaskOrchestrator<PlannedBlock, PlannedTrial, TrialRecord>(context);
  applyTaskInstructionConfig(context.taskConfig, {
    ...parsed.instructions,
    blockSummary: {
      enabled: true,
      metrics: { correctField: "responseCorrect" },
    },
  });
  const payload = await orchestrator.run({
    buttonIdPrefix: "stroop-continue",
    getBlocks: () => plannedBlocks,
    getTrials: ({ block }) => block.trials,
    runTrial: async ({ block, blockIndex, trial }) => {
      if (!jsPsych) throw new Error("jsPsych not initialized");
      const trialTimeline: any[] = [];
      appendStroopTrialTimeline({
        timeline: trialTimeline,
        parsed,
        block,
        blockIndex,
        trial,
        participantId,
        variantId: selection.variantId,
        records,
        eventLogger,
      });
      await runJsPsychTimeline(jsPsych, trialTimeline);
      const record = records.find((r) => r.blockIndex === blockIndex && r.trialIndex === trial.trialIndex);
      if (!record) throw new Error(`Stroop record not found for block ${blockIndex} trial ${trial.trialIndex}`);
      return record;
    },
    onTaskStart: () => {
      jsPsych = initJsPsych({
        display_element: root,
        on_trial_start: (trial: Record<string, unknown>) => {
          const data = asObject(trial?.data);
          setCursorHidden(shouldHideCursorForPhase(data?.phase));
        },
        on_finish: () => {
          setCursorHidden(false);
        },
      });
      eventLogger.emit("task_start", { task: "stroop", runner: "jspsych", mode: parsed.mode });
    },
    onBlockStart: ({ block, blockIndex }) => {
      eventLogger.emit("block_start", { blockId: block.id, label: block.label }, { blockIndex });
    },
    onBlockEnd: ({ block, blockIndex }) => {
      const blockRows = records.filter((row) => row.blockIndex === blockIndex);
      const correct = blockRows.reduce((acc, row) => acc + row.responseCorrect, 0);
      const accuracy = computeAccuracy(correct, blockRows.length);
      eventLogger.emit("block_end", { blockId: block.id, label: block.label, accuracy }, { blockIndex });
    },
    onTaskEnd: (payload) => {
      eventLogger.emit("task_end", {
        task: "stroop",
        mode: parsed.mode,
        trials: records.length,
      });
      setCursorHidden(false);
    },
    csvOptions: {
      suffix: "stroop_trials",
      getRecords: () => records,
    },
    getEvents: () => eventLogger.events,
    getTaskMetadata: () => ({
      runner: "jspsych",
      mode: parsed.mode,
      records,
      jsPsychData: jsPsych?.data.get().values() ?? [],
    }),
    renderInstruction: createInstructionRenderer({
      showBlockLabel: parsed.instructions.showBlockLabel,
      introAppendHtml: `<p><b>Respond to the font color:</b> red = <code>${escapeHtml(parsed.mapping.redKey)}</code>, green = <code>${escapeHtml(parsed.mapping.greenKey)}</code></p>`,
    }),
    completeTitle: "Stroop complete",
  });
  return payload;
}

function appendStroopTrialTimeline(args: {
  timeline: any[];
  parsed: ParsedStroopConfig;
  block: PlannedBlock;
  blockIndex: number;
  trial: PlannedTrial;
  participantId: string;
  variantId: string;
  records: TrialRecord[];
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, parsed, block, blockIndex, trial, participantId, variantId, records, eventLogger } = args;
  const layout = computeCanvasFrameLayout({
    aperturePx: parsed.display.aperturePx,
    paddingYPx: parsed.display.paddingYPx,
    cueHeightPx: parsed.display.cueHeightPx,
    cueMarginBottomPx: parsed.display.cueMarginBottomPx,
  });
  const feedback = block.feedback;
  const phase = computeRtPhaseDurations(parsed.rtTask.timing, {
    responseTerminatesTrial: parsed.rtTask.responseTerminatesTrial,
  });

  const state: { feedbackView: { text: string; color: string } | null } = { feedbackView: null };

  const nodes = buildJsPsychRtTimelineNodes({
    phasePrefix: "",
    responseTerminatesTrial: parsed.rtTask.responseTerminatesTrial,
    durations: phase,
    canvasSize: [layout.totalHeightPx, parsed.display.aperturePx],
    allowedKeys: toJsPsychChoices(parsed.allowedKeys),
    baseData: {
      blockIndex,
      trialIndex: trial.trialIndex,
      blockId: block.id,
      trialId: trial.id,
      mode: parsed.mode,
      conditionLabel: trial.conditionLabel,
      fontColorToken: trial.fontColorToken,
      word: trial.word,
    },
    renderFixation: (canvas: HTMLCanvasElement) => {
      drawFixation(canvas, parsed, layout);
    },
    renderBlank: (canvas: HTMLCanvasElement) => {
      drawBlank(canvas, parsed, layout);
    },
    renderStimulus: (canvas: HTMLCanvasElement) => {
      drawStimulus(canvas, parsed, layout, trial);
    },
    renderFeedback: (canvas: HTMLCanvasElement) => {
      drawFeedback(canvas, parsed, layout, feedback, state.feedbackView);
    },
    feedback: {
      enabled: feedback.enabled,
      durationMs: feedback.durationMs,
      phaseMode: parsed.rtTask.feedbackPhase,
    },
    postResponseContent: parsed.rtTask.postResponseContent,
    onResponse: (response: { key: string | null; rtMs: number | null }, data: Record<string, unknown>) => {
      const responseCategory = parsed.responseSemantics.responseCategoryFromKey(response.key);
      const outcome = evaluateTrialOutcome({
        responseCategory,
        expectedCategory: trial.fontColorToken,
        rt: response.rtMs,
      });

      state.feedbackView = resolveTrialFeedbackView({
        feedback,
        responseCategory,
        correct: outcome.correct,
        vars: {
          expectedCategory: trial.fontColorToken,
          word: trial.word,
          conditionLabel: trial.conditionLabel,
          blockLabel: block.label,
        },
      });

      const record: TrialRecord = {
        participantId,
        variantId,
        mode: parsed.mode,
        blockId: block.id,
        blockLabel: block.label,
        blockIndex,
        trialId: trial.id,
        trialIndex: trial.trialIndex,
        word: trial.word,
        wordColorToken: trial.wordColorToken ?? "",
        valence: trial.valence ?? "",
        fontColorToken: trial.fontColorToken,
        fontColorHex: trial.fontColorHex,
        conditionLabel: trial.conditionLabel,
        correctResponse: trial.correctResponse,
        responseKey: response.key ?? "",
        responseRtMs: outcome.rt,
        responseCorrect: outcome.correct,
      };
      records.push(record);

      eventLogger.emit(
        "trial_end",
        {
          conditionLabel: trial.conditionLabel,
          word: trial.word,
          fontColorToken: trial.fontColorToken,
          responseKey: record.responseKey,
          responseRtMs: record.responseRtMs,
          responseCorrect: record.responseCorrect,
        },
        { blockIndex, trialIndex: trial.trialIndex },
      );
    },
  });

  for (const node of nodes) {
    if (node.data.phase && node.data.phase.startsWith("_")) {
      node.data.phase = node.data.phase.substring(1);
    }
    timeline.push(node);
  }
}

function drawFixation(
  canvas: HTMLCanvasElement,
  parsed: ParsedStroopConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCanvasFramedScene(
    ctx,
    layout,
    {
      cueText: "",
      cueColor: parsed.display.cueColor,
      frameBackground: parsed.display.frameBackground,
      frameBorder: parsed.display.frameBorder,
    },
    ({ ctx: frameCtx, centerX, centerY }) => {
      drawCanvasCenteredText(frameCtx, centerX, centerY, "+", {
        color: parsed.display.fixationColor,
        fontSizePx: parsed.display.fixationFontSizePx,
        fontWeight: parsed.display.fixationFontWeight,
      });
    },
  );
}

function drawBlank(
  canvas: HTMLCanvasElement,
  parsed: ParsedStroopConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCanvasFramedScene(ctx, layout, {
    cueText: "",
    cueColor: parsed.display.cueColor,
    frameBackground: parsed.display.frameBackground,
    frameBorder: parsed.display.frameBorder,
  });
}

function drawStimulus(
  canvas: HTMLCanvasElement,
  parsed: ParsedStroopConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  trial: PlannedTrial,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCanvasFramedScene(
    ctx,
    layout,
    {
      cueText: "",
      cueColor: parsed.display.cueColor,
      frameBackground: parsed.display.frameBackground,
      frameBorder: parsed.display.frameBorder,
    },
    ({ ctx: frameCtx, centerX, centerY }) => {
      drawCanvasCenteredText(frameCtx, centerX, centerY, trial.word, {
        color: trial.fontColorHex,
        fontSizePx: parsed.display.stimulusFontSizePx,
        fontWeight: parsed.display.stimulusFontWeight,
      });
    },
  );
}

function drawFeedback(
  canvas: HTMLCanvasElement,
  parsed: ParsedStroopConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  feedback: TrialFeedbackConfig,
  feedbackView: { text: string; color: string } | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawTrialFeedbackOnCanvas(ctx, layout, feedback, feedbackView);
  void parsed;
}

async function parseStroopConfig(config: JSONObject): Promise<ParsedStroopConfig> {
  const taskRaw = asObject(config.task);
  const instructionsRaw = asObject(config.instructions);
  const conditionsRaw = asObject(config.conditions);
  const displayRaw = asObject(config.display);
  const stimuliRaw = asObject(config.stimuli);
  const planRaw = asObject(config.plan);
  const mappingRaw = asObject(config.mapping);

  const mode = parseMode(conditionsRaw?.mode);

  const mapping = {
    redKey: normalizeKey(asString(mappingRaw?.redKey) || "f"),
    greenKey: normalizeKey(asString(mappingRaw?.greenKey) || "j"),
  };
  if (mapping.redKey === mapping.greenKey) {
    throw new Error("Stroop config invalid: mapping.redKey and mapping.greenKey must be distinct.");
  }

  const responseColorTokens = asArray(stimuliRaw?.responseColorTokens)
    .map((entry) => asString(entry)?.toLowerCase())
    .filter((entry): entry is string => Boolean(entry));
  const normalizedResponseColors = responseColorTokens.length > 0 ? dedupeStrings(responseColorTokens) : ["red", "green"];
  for (const required of ["red", "green"]) {
    if (!normalizedResponseColors.includes(required)) {
      throw new Error(`Stroop config invalid: stimuli.responseColorTokens must include '${required}'.`);
    }
  }

  const responseSemantics = createResponseSemantics({
    red: mapping.redKey,
    green: mapping.greenKey,
  });

  const textColorByTokenRaw = asObject(displayRaw?.textColorByToken);
  const textColorByToken: Record<string, string> = {
    red: "#ff0000",
    green: "#00aa00",
    ...(textColorByTokenRaw ?? {}),
  } as Record<string, string>;
  const colorRegistry = createColorRegistry(textColorByToken);
  for (const token of normalizedResponseColors) {
    if (!colorRegistry.has(token)) {
      throw new Error(`Stroop config invalid: display.textColorByToken missing token '${token}'.`);
    }
  }

  const feedbackDefaults = parseTrialFeedbackConfig(asObject(config.feedback), null);

  const defaultTiming: RtTiming = {
    trialDurationMs: 2000,
    fixationDurationMs: 500,
    stimulusOnsetMs: 700,
    responseWindowStartMs: 700,
    responseWindowEndMs: 1700,
  };
  const legacyTimingRaw = asObject(config.timing);
  if (legacyTimingRaw) {
    defaultTiming.trialDurationMs = toPositiveNumber(legacyTimingRaw.trialDurationMs, defaultTiming.trialDurationMs);
    defaultTiming.fixationDurationMs = toNonNegativeNumber(legacyTimingRaw.fixationDurationMs, defaultTiming.fixationDurationMs);
    defaultTiming.stimulusOnsetMs = toNonNegativeNumber(legacyTimingRaw.stimulusOnsetMs, defaultTiming.stimulusOnsetMs);
    defaultTiming.responseWindowStartMs = toNonNegativeNumber(legacyTimingRaw.responseWindowStartMs, defaultTiming.responseWindowStartMs);
    defaultTiming.responseWindowEndMs = toNonNegativeNumber(legacyTimingRaw.responseWindowEndMs, defaultTiming.responseWindowEndMs);
  }

  const rtRaw = asObject(taskRaw?.rtTask);
  const rtTimingRaw = asObject(rtRaw?.timing);
  const rtTiming: RtTiming = {
    trialDurationMs: toPositiveNumber(rtTimingRaw?.trialDurationMs, defaultTiming.trialDurationMs),
    fixationDurationMs: toNonNegativeNumber(rtTimingRaw?.fixationDurationMs, defaultTiming.fixationDurationMs),
    stimulusOnsetMs: toNonNegativeNumber(rtTimingRaw?.stimulusOnsetMs, defaultTiming.stimulusOnsetMs),
    responseWindowStartMs: toNonNegativeNumber(rtTimingRaw?.responseWindowStartMs, defaultTiming.responseWindowStartMs),
    responseWindowEndMs: toNonNegativeNumber(rtTimingRaw?.responseWindowEndMs, defaultTiming.responseWindowEndMs),
  };
  const postResponseContentRaw = (asString(rtRaw?.postResponseContent) || "stimulus").toLowerCase();
  const feedbackPhaseRaw = (asString(rtRaw?.feedbackPhase) || "separate").toLowerCase();

  const blockCount = toPositiveNumber(planRaw?.blockCount, 2);
  const blockTemplateRaw = asObject(planRaw?.blockTemplate);
  const trialsPerBlock = toPositiveNumber(blockTemplateRaw?.trials, 36);
  const blockFeedback = parseTrialFeedbackConfig(asObject(blockTemplateRaw?.feedback), feedbackDefaults);
  const rawBeforeBlockScreens = blockTemplateRaw?.beforeBlockScreens ?? blockTemplateRaw?.preBlockInstructions;
  const rawAfterBlockScreens = blockTemplateRaw?.afterBlockScreens ?? blockTemplateRaw?.postBlockInstructions;
  const parsedBeforeBlockScreens = toStringScreens(rawBeforeBlockScreens);
  const parsedAfterBlockScreens = toStringScreens(rawAfterBlockScreens);
  const blocks = Array.from({ length: blockCount }, (_, idx) => ({
    id: `B${idx + 1}`,
    label: (asString(blockTemplateRaw?.label) || "Block {blockIndex}").replace("{blockIndex}", String(idx + 1)),
    trials: trialsPerBlock,
    feedback: blockFeedback,
    beforeBlockScreens: parsedBeforeBlockScreens.map((screen) => screen.replaceAll("{blockIndex}", String(idx + 1))),
    afterBlockScreens: parsedAfterBlockScreens.map((screen) => screen.replaceAll("{blockIndex}", String(idx + 1))),
  }));

  const labels = mode === "congruence"
    ? (["congruent", "incongruent", "neutral"] as StroopCondition[])
    : (["positive", "neutral", "negative"] as StroopCondition[]);
  const quotaPerBlock = parseQuotaMap(asObject(conditionsRaw?.quotaPerBlock), labels, trialsPerBlock);
  const fontColorQuotaPerBlock = parseQuotaMap(asObject(conditionsRaw?.fontColorQuotaPerBlock), normalizedResponseColors, trialsPerBlock);

  const words = await resolveWords(stimuliRaw);

  const colorLexicon = await resolveColorLexicon(stimuliRaw, normalizedResponseColors);
  const wordColorResolver = createSemanticResolver(colorLexicon);

  const valenceIndex = await resolveValenceIndex(stimuliRaw);
  const valenceResolver = createSemanticResolver(valenceIndex);
  const resolvedWords = mode === "valence" ? dedupeStrings([...words, ...Object.keys(valenceIndex)]) : words;
  if (resolvedWords.length === 0) {
    throw new Error("Stroop config invalid: no stimuli words were found.");
  }
  if (mode === "valence") {
    const unmapped = resolvedWords.filter((word) => !valenceResolver.has(word));
    if (unmapped.length > 0) {
      throw new Error(`Stroop config invalid: valence mode requires all words to be labeled; missing: ${unmapped.slice(0, 10).join(", ")}`);
    }
  }

  const instructionConfig = buildTaskInstructionConfig({
    title: asString(taskRaw?.title) || "Stroop Task",
    instructions: instructionsRaw,
    defaults: {
      intro: [
        asString(taskRaw?.instructions) ||
          "Respond to the FONT COLOR of each word as quickly and accurately as possible.",
      ],
    },
    blockIntroTemplateDefault: "Press continue when ready.",
  });

  return {
    title: asString(taskRaw?.title) || "Stroop Task",
    instructions: instructionConfig,
    mode,
    mapping,
    responseSemantics,
    allowedKeys: responseSemantics.allowedKeys(["red", "green"]),
    responseColorTokens: normalizedResponseColors,
    rtTask: {
      timing: rtTiming,
      responseTerminatesTrial: rtRaw?.responseTerminatesTrial === true,
      postResponseContent: postResponseContentRaw === "blank" ? "blank" : "stimulus",
      feedbackPhase: feedbackPhaseRaw === "post_response" ? "post_response" : "separate",
    },
    display: {
      aperturePx: toPositiveNumber(displayRaw?.aperturePx, 440),
      paddingYPx: toNonNegativeNumber(displayRaw?.paddingYPx, 16),
      cueHeightPx: toNonNegativeNumber(displayRaw?.cueHeightPx, 0),
      cueMarginBottomPx: toNonNegativeNumber(displayRaw?.cueMarginBottomPx, 0),
      frameBackground: asString(displayRaw?.frameBackground) || "#ffffff",
      frameBorder: asString(displayRaw?.frameBorder) || "2px solid #d1d5db",
      cueColor: asString(displayRaw?.cueColor) || "#0f172a",
      fixationColor: asString(displayRaw?.fixationColor) || "#111827",
      fixationFontSizePx: toPositiveNumber(displayRaw?.fixationFontSizePx, 30),
      fixationFontWeight: toPositiveNumber(displayRaw?.fixationFontWeight, 600),
      stimulusFontSizePx: toPositiveNumber(displayRaw?.stimulusFontSizePx, 56),
      stimulusFontWeight: toPositiveNumber(displayRaw?.stimulusFontWeight, 700),
      textColorByToken,
    },
    feedbackDefaults,
    conditions: {
      labels,
      quotaPerBlock,
      fontColorQuotaPerBlock,
      maxConditionRunLength: toPositiveNumber(conditionsRaw?.maxConditionRunLength, 3),
      noImmediateWordRepeat: conditionsRaw?.noImmediateWordRepeat !== false,
    },
    words: resolvedWords,
    wordColorResolver,
    valenceResolver,
    blocks,
  };
}

function buildStroopPlan(parsed: ParsedStroopConfig, baseRng: () => number): PlannedBlock[] {
  const output: PlannedBlock[] = [];
  const responseSet = new Set(parsed.responseColorTokens);
  const colorRegistry = createColorRegistry(parsed.display.textColorByToken);

  for (let blockIndex = 0; blockIndex < parsed.blocks.length; blockIndex += 1) {
    const block = parsed.blocks[blockIndex];
    const blockRng = createMulberry32(hashSeed("stroop_block", block.id, String(blockIndex), String(Math.floor(baseRng() * 1e9))));

    const conditionSequence = buildConditionSequence({
      factors: [{ name: "condition", levels: parsed.conditions.labels }],
      trialCount: block.trials,
      cellWeights: Object.fromEntries(
        parsed.conditions.labels.map((label) => [
          createConditionCellId({ condition: label }),
          parsed.conditions.quotaPerBlock[label] ?? 0,
        ]),
      ),
      adjacency: {
        maxRunLengthByFactor: { condition: parsed.conditions.maxConditionRunLength },
      },
      rng: { next: () => blockRng() },
      maxAttempts: 500,
    }).map((cell) => cell.levels.condition as StroopCondition);

    const candidatePools = buildCandidatePools(parsed, responseSet);
    const plannedTrials = buildBlockTrials({
      parsed,
      block,
      conditionSequence,
      candidatePools,
      colorRegistry,
      rng: blockRng,
    });

    output.push({
      id: block.id,
      label: block.label,
      trials: plannedTrials,
      feedback: block.feedback,
      beforeBlockScreens: block.beforeBlockScreens,
      afterBlockScreens: block.afterBlockScreens,
    });
  }

  return output;
}

function buildCandidatePools(
  parsed: ParsedStroopConfig,
  responseSet: Set<string>,
): Record<string, Record<string, string[]>> {
  const pools: Record<string, Record<string, string[]>> = {};

  for (const condition of parsed.conditions.labels) {
    pools[condition] = {};
    for (const colorToken of parsed.responseColorTokens) {
      const candidates = parsed.words.filter((word) => {
        const semanticColor = parsed.wordColorResolver.resolve(word);
        const valence = parsed.valenceResolver.resolve(word);
        if (parsed.mode === "congruence") {
          if (condition === "congruent") return semanticColor === colorToken;
          if (condition === "incongruent") return semanticColor != null && responseSet.has(semanticColor) && semanticColor !== colorToken;
          return semanticColor == null || !responseSet.has(semanticColor);
        }
        return valence === condition;
      });
      pools[condition][colorToken] = dedupeStrings(candidates);
    }
  }

  return pools;
}

function buildBlockTrials(args: {
  parsed: ParsedStroopConfig;
  block: ParsedStroopConfig["blocks"][number];
  conditionSequence: StroopCondition[];
  candidatePools: Record<string, Record<string, string[]>>;
  colorRegistry: ReturnType<typeof createColorRegistry>;
  rng: () => number;
}): PlannedTrial[] {
  const { parsed, block, conditionSequence, candidatePools, colorRegistry, rng } = args;

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const colorSequence = assignColorsToConditionSequence(
      conditionSequence,
      parsed.conditions.fontColorQuotaPerBlock,
      parsed.responseColorTokens,
      candidatePools,
      rng,
    );
    if (!colorSequence) continue;

    const words: string[] = [];
    let prevWord = "";
    let ok = true;
    for (let i = 0; i < conditionSequence.length; i += 1) {
      const condition = conditionSequence[i];
      const color = colorSequence[i];
      const pool = candidatePools[condition]?.[color] ?? [];
      if (pool.length === 0) {
        ok = false;
        break;
      }
      const filtered = parsed.conditions.noImmediateWordRepeat ? pool.filter((word) => word !== prevWord) : pool;
      const chosenPool = filtered.length > 0 ? filtered : pool;
      const word = chooseFrom(chosenPool, rng);
      if (!word) {
        ok = false;
        break;
      }
      words.push(word);
      prevWord = word;
    }
    if (!ok || words.length !== conditionSequence.length) continue;

    const trials: PlannedTrial[] = words.map((word, idx) => {
      const fontColorToken = colorSequence[idx];
      const fontColorHex = colorRegistry.resolve(fontColorToken) || "#000000";
      const conditionLabel = conditionSequence[idx];
      return {
        id: `${block.id}_T${idx + 1}`,
        trialIndex: idx,
        word,
        fontColorToken,
        fontColorHex,
        conditionLabel,
        wordColorToken: parsed.wordColorResolver.resolve(word),
        valence: parsed.valenceResolver.resolve(word),
        correctResponse: parsed.responseSemantics.keyForCategory(fontColorToken) ?? "",
      };
    });

    return trials;
  }

  throw new Error(`Failed to generate valid Stroop trial list for block '${block.id}'.`);
}

function assignColorsToConditionSequence(
  conditions: StroopCondition[],
  colorQuota: Record<string, number>,
  colorTokens: string[],
  candidatePools: Record<string, Record<string, string[]>>,
  rng: () => number,
): string[] | null {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const remaining: Record<string, number> = { ...colorQuota };
    const assigned: string[] = [];
    let ok = true;

    for (const condition of conditions) {
      const candidates = colorTokens.filter((color) => {
        const remainingCount = remaining[color] ?? 0;
        const pool = candidatePools[condition]?.[color] ?? [];
        return remainingCount > 0 && pool.length > 0;
      });
      if (candidates.length === 0) {
        ok = false;
        break;
      }

      const weighted = candidates.flatMap((color) => {
        const weight = Math.max(1, remaining[color] ?? 1);
        return Array.from({ length: weight }, () => color);
      });
      const chosen = chooseFrom(weighted, rng);
      if (!chosen) {
        ok = false;
        break;
      }
      assigned.push(chosen);
      remaining[chosen] = Math.max(0, (remaining[chosen] ?? 0) - 1);
    }

    if (ok && assigned.length === conditions.length) {
      return assigned;
    }
  }
  return null;
}

function parseMode(value: unknown): StroopMode {
  const mode = (asString(value) || "congruence").toLowerCase();
  return mode === "valence" ? "valence" : "congruence";
}

function parseQuotaMap(raw: Record<string, unknown> | null, labels: string[], expectedTotal: number): Record<string, number> {
  const output: Record<string, number> = {};
  const provided = raw ? labels.some((label) => Object.prototype.hasOwnProperty.call(raw, label)) : false;
  if (!provided) {
    const base = Math.floor(expectedTotal / labels.length);
    let rem = expectedTotal - base * labels.length;
    for (const label of labels) {
      output[label] = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
    }
    return output;
  }

  for (const label of labels) {
    output[label] = toNonNegativeNumber(raw?.[label], 0);
  }
  const total = Object.values(output).reduce((acc, value) => acc + value, 0);
  if (total !== expectedTotal) {
    throw new Error(`Stroop config invalid: quota total (${total}) must equal blockTemplate.trials (${expectedTotal}).`);
  }
  return output;
}

async function resolveWords(stimuliRaw: Record<string, unknown> | null): Promise<string[]> {
  const wordsCsvRaw = asObject(stimuliRaw?.wordsCsv);
  return loadTokenPool({
    inline: stimuliRaw?.words,
    csv: wordsCsvRaw
      ? {
          path: asString(wordsCsvRaw.path) || "",
          column: asString(wordsCsvRaw.column) || "word",
          basePath: asString(wordsCsvRaw.basePath) || undefined,
        }
      : null,
    normalize: "lowercase",
    dedupe: true,
  });
}

async function resolveColorLexicon(
  stimuliRaw: Record<string, unknown> | null,
  responseColorTokens: string[],
): Promise<Record<string, string>> {
  const baseMap: Record<string, string> = Object.fromEntries(responseColorTokens.map((token) => [token, token]));
  const colorLexiconRaw = asObject(stimuliRaw?.colorLexicon);

  const inlineMap = asObject(colorLexiconRaw?.map) ?? colorLexiconRaw;
  for (const [rawWord, rawToken] of Object.entries(inlineMap ?? {})) {
    if (rawWord === "csv" || rawWord === "map") continue;
    const word = String(rawWord || "").trim().toLowerCase();
    const token = String(rawToken || "").trim().toLowerCase();
    if (!word || !token) continue;
    baseMap[word] = token;
  }

  const csvSpec = asObject(colorLexiconRaw?.csv);
  const csvPath = asString(csvSpec?.path);
  if (csvPath) {
    const keyColumn = asString(csvSpec?.keyColumn) || "word";
    const valueColumn = asString(csvSpec?.valueColumn) || "color";
    const csvMap = await loadCsvDictionary({
      path: csvPath,
      keyColumn,
      valueColumn,
      basePath: asString(csvSpec?.basePath) || undefined,
    });
    for (const [key, value] of csvMap.entries()) {
      baseMap[key] = value.trim().toLowerCase();
    }
  }

  return baseMap;
}

async function resolveValenceIndex(stimuliRaw: Record<string, unknown> | null): Promise<Record<string, string>> {
  const valenceRaw = asObject(stimuliRaw?.valenceLists);
  const output: Record<string, string> = {};

  const inlineLabels: Array<[string, unknown]> = [
    ["positive", valenceRaw?.positive],
    ["neutral", valenceRaw?.neutral],
    ["negative", valenceRaw?.negative],
  ];
  for (const [label, rawList] of inlineLabels) {
    for (const word of asArray(rawList).map((entry) => asString(entry)).filter((entry): entry is string => Boolean(entry))) {
      output[word.toLowerCase()] = label;
    }
  }

  const csvRaw = asObject(valenceRaw?.csv);
  const csvPath = asString(csvRaw?.path);
  if (csvPath) {
    const columns = asObject(csvRaw?.columns);
    const basePath = asString(csvRaw?.basePath) || undefined;
    for (const [label, fallbackColumn] of [
      ["positive", "positive"],
      ["neutral", "neutral"],
      ["negative", "negative"],
    ] as const) {
      const column = asString(columns?.[label]) || fallbackColumn;
      const items = await loadTokenPool({
        csv: { path: csvPath, column, basePath },
        normalize: "lowercase",
        dedupe: true,
      });
      for (const item of items) {
        output[item.toLowerCase()] = label;
      }
    }
  }

  return output;
}

function chooseFrom<T>(items: T[], rng: () => number): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(rng() * items.length);
  return items[index] ?? null;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of values) {
    const value = String(entry || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}
