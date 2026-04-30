import {
  asObject,
  asString,
  computeCanvasFrameLayout,
  computeRtPhaseDurations,
  createConditionCellId,
  createEventLogger,
  createMulberry32,
  createResponseSemantics,
  drawCanvasCenteredText,
  drawCanvasFramedScene,
  drawTrialFeedbackOnCanvas,
  escapeHtml,
  evaluateTrialOutcome,
  hashSeed,
  TaskEnvironmentGuard,
  normalizeKey,
  parseTrialFeedbackConfig,
  buildTaskInstructionConfig,
  resolveTrialFeedbackView,
  runJsPsychTimeline,
  setCursorHidden,
  shouldHideCursorForPhase,
  computeAccuracy,
  TaskOrchestrator,
  createInstructionRenderer,
  StandardTaskInstructionConfig,
  toJsPsychChoices,
  toNonNegativeNumber,
  toPositiveNumber,
  toStringScreens,
  resolveBlockScreenSlotValue,
  ensureJsPsychCanvasCentered,
  applyTaskInstructionConfig,
  createTaskAdapter,
  buildJsPsychRtTimelineNodes,
  resolveRtTaskConfig,
  buildConditionSequence,
  maybeExportStimulusRows,
  type ResolvedRtTaskConfig,
  type JSONObject,
  type RtTiming,
  type TaskAdapterContext,
  type TrialFeedbackConfig,
  type ResponseSemantics,
} from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";

type FlankerCondition = "congruent" | "incongruent" | "neutral";
type FlankerDirection = "left" | "right";

interface ParsedFlankerConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  mapping: {
    leftKey: string;
    rightKey: string;
  };
  responseSemantics: ResponseSemantics;
  allowedKeys: string[];
  rtTask: ResolvedRtTaskConfig & {
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
    stimulusColor: string;
    stimulusSpacingPx: number;
  };
  stimuli: {
    leftTarget: string;
    rightTarget: string;
    leftFlanker: string;
    rightFlanker: string;
    neutralFlanker: string;
    flankerCount: number; // total flankers (e.g. 4 means 2 on each side)
  };
  feedbackDefaults: TrialFeedbackConfig;
  conditions: {
    labels: FlankerCondition[];
    quotaPerBlock: Record<string, number>;
    maxConditionRunLength: number;
  };
  blocks: Array<{
    id: string;
    label: string;
    trials: number;
    feedback: TrialFeedbackConfig;
    beforeBlockScreens: string[];
    afterBlockScreens: string[];
  }>;
}

const flankerManifest = {
  taskId: "flanker",
  label: "Flanker",
};

const flankerEnvironment = new TaskEnvironmentGuard();

export const flankerAdapter = createTaskAdapter({
  manifest: flankerManifest,
  run: runFlankerTask,
  terminate: async () => {
    flankerEnvironment.cleanup();
  },
});

async function runFlankerTask(context: TaskAdapterContext): Promise<unknown> {
  const parsed = await parseFlankerConfig(context.taskConfig);
  const selection = context.selection;
  const participantId = selection.participant.participantId;
  const baseRng = createMulberry32(hashSeed(participantId, selection.participant.sessionId, selection.configPath ?? "", "flanker"));
  const records: TrialRecord[] = [];
  const root = context.container;
  const eventLogger = createEventLogger(selection);
  const plannedBlocks = buildFlankerPlan(parsed, baseRng);

  const rows = plannedBlocks.flatMap((block, blockIndex) =>
    block.trials.map((trial) => ({
      block_index: blockIndex,
      block_id: block.id,
      block_label: block.label,
      trial_index: trial.trialIndex,
      trial_id: trial.id,
      condition_label: trial.conditionLabel,
      target_direction: trial.targetDirection,
      flanker_direction: trial.flankerDirection,
      stimulus_string: trial.stimulusString,
      trial_code: trial.conditionLabel,
      correct_response: trial.correctResponse,
    })),
  );
  const stimulusExport = await maybeExportStimulusRows({
    context,
    rows,
    suffix: "flanker_stimulus_list",
  });
  if (stimulusExport) return stimulusExport;

  root.style.maxWidth = "980px";
  root.style.margin = "0 auto";
  root.style.fontFamily = "system-ui";
  ensureJsPsychCanvasCentered(root);

  flankerEnvironment.installKeyScrollBlocker(parsed.allowedKeys);

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
    buttonIdPrefix: "flanker-continue",
    getBlocks: () => plannedBlocks,
    getTrials: ({ block }) => block.trials,
    runTrial: async ({ block, blockIndex, trial }) => {
      if (!jsPsych) throw new Error("jsPsych not initialized");
      const trialTimeline: any[] = [];
      appendFlankerTrialTimeline({
        timeline: trialTimeline,
        parsed,
        block,
        blockIndex,
        trial,
        participantId,
        configPath: selection.configPath ?? "",
        records,
        eventLogger,
      });
      await runJsPsychTimeline(jsPsych, trialTimeline);
      const record = records.find((r) => r.blockIndex === blockIndex && r.trialIndex === trial.trialIndex);
      if (!record) throw new Error(`Flanker record not found for block ${blockIndex} trial ${trial.trialIndex}`);
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
      eventLogger.emit("task_start", { task: "flanker", runner: "jspsych" });
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
        task: "flanker",
        trials: records.length,
      });
      setCursorHidden(false);
    },
    csvOptions: {
      suffix: "flanker_trials",
      getRecords: () => records,
    },
    getEvents: () => eventLogger.events,
    getTaskMetadata: () => ({
      runner: "jspsych",
      records,
      jsPsychData: jsPsych?.data.get().values() ?? [],
    }),
    renderInstruction: createInstructionRenderer({
      showBlockLabel: parsed.instructions.showBlockLabel,
      introAppendHtml: `<p><b>Respond to the central arrow direction:</b> left = <code>${escapeHtml(parsed.mapping.leftKey)}</code>, right = <code>${escapeHtml(parsed.mapping.rightKey)}</code></p>`,
    }),
    completeTitle: "Flanker complete",
  });
  return payload;
}

export async function parseFlankerConfig(config: JSONObject): Promise<ParsedFlankerConfig> {
  const taskRaw = asObject(config.task);
  const instructionsRaw = asObject(config.instructions);
  const conditionsRaw = asObject(config.conditions);
  const displayRaw = asObject(config.display);
  const stimuliRaw = asObject(config.stimuli);
  const planRaw = asObject(config.plan);
  const mappingRaw = asObject(config.mapping);

  const mapping = {
    leftKey: normalizeKey(asString(mappingRaw?.leftKey) || "f"),
    rightKey: normalizeKey(asString(mappingRaw?.rightKey) || "j"),
  };
  if (mapping.leftKey === mapping.rightKey) {
    throw new Error("Flanker config invalid: mapping.leftKey and mapping.rightKey must be distinct.");
  }

  const responseSemantics = createResponseSemantics({
    left: mapping.leftKey,
    right: mapping.rightKey,
  });

  const feedbackDefaults = parseTrialFeedbackConfig(asObject(config.feedback), null);

  const defaultTiming: RtTiming = {
    trialDurationMs: 2000,
    fixationOnsetMs: 0,
    fixationDurationMs: 500,
    stimulusOnsetMs: 700,
    responseWindowStartMs: 700,
    responseWindowEndMs: 1700,
  };
  const legacyTimingRaw = asObject(config.timing);
  if (legacyTimingRaw) {
    defaultTiming.trialDurationMs = toPositiveNumber(legacyTimingRaw.trialDurationMs, defaultTiming.trialDurationMs);
    defaultTiming.fixationOnsetMs = toNonNegativeNumber(legacyTimingRaw.fixationOnsetMs, defaultTiming.fixationOnsetMs ?? 0);
    defaultTiming.fixationDurationMs = toNonNegativeNumber(legacyTimingRaw.fixationDurationMs, defaultTiming.fixationDurationMs);
    defaultTiming.stimulusOnsetMs = toNonNegativeNumber(legacyTimingRaw.stimulusOnsetMs, defaultTiming.stimulusOnsetMs);
    defaultTiming.responseWindowStartMs = toNonNegativeNumber(legacyTimingRaw.responseWindowStartMs, defaultTiming.responseWindowStartMs);
    defaultTiming.responseWindowEndMs = toNonNegativeNumber(legacyTimingRaw.responseWindowEndMs, defaultTiming.responseWindowEndMs);
  }

  const rtRaw = asObject(taskRaw?.rtTask);
  const rtTask = resolveRtTaskConfig({
    baseTiming: defaultTiming,
    override: rtRaw,
    defaultEnabled: false,
    defaultResponseTerminatesTrial: false,
  });

  const postResponseContentRaw = (asString(rtRaw?.postResponseContent) || "stimulus").toLowerCase();
  const feedbackPhaseRaw = (asString(rtRaw?.feedbackPhase) || "separate").toLowerCase();

  const blockCount = toPositiveNumber(planRaw?.blockCount, 2);
  const blockTemplateRaw = asObject(planRaw?.blockTemplate);
  const trialsPerBlock = toPositiveNumber(blockTemplateRaw?.trials, 36);
  const blockFeedback = parseTrialFeedbackConfig(asObject(blockTemplateRaw?.feedback), feedbackDefaults);
  const rawBeforeBlockScreens = resolveBlockScreenSlotValue(blockTemplateRaw ?? null, "before");
  const rawAfterBlockScreens = resolveBlockScreenSlotValue(blockTemplateRaw ?? null, "after");
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

  const labels = ["congruent", "incongruent", "neutral"] as FlankerCondition[];
  const quotaPerBlock = parseQuotaMap(asObject(conditionsRaw?.quotaPerBlock), labels, trialsPerBlock);

  const instructionConfig = buildTaskInstructionConfig({
    title: asString(taskRaw?.title) || "Flanker Task",
    instructions: instructionsRaw,
    defaults: {
      intro: [
        asString(taskRaw?.instructions) ||
          "Respond to the direction of the CENTRAL ARROW as quickly and accurately as possible.",
      ],
    },
    blockIntroTemplateDefault: "Press continue when ready.",
  });

  let flankerCount = toPositiveNumber(stimuliRaw?.flankerCount, 4);
  if (flankerCount % 2 !== 0) flankerCount += 1; // ensure even number of flankers to balance

  return {
    title: asString(taskRaw?.title) || "Flanker Task",
    instructions: instructionConfig,
    mapping,
    responseSemantics,
    allowedKeys: responseSemantics.allowedKeys(["left", "right"]),
    rtTask: {
      ...rtTask,
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
      stimulusColor: asString(displayRaw?.stimulusColor) || "#000000",
      stimulusSpacingPx: toNonNegativeNumber(displayRaw?.stimulusSpacingPx, 10),
    },
    stimuli: {
      leftTarget: asString(stimuliRaw?.leftTarget) || "<",
      rightTarget: asString(stimuliRaw?.rightTarget) || ">",
      leftFlanker: asString(stimuliRaw?.leftFlanker) || "<",
      rightFlanker: asString(stimuliRaw?.rightFlanker) || ">",
      neutralFlanker: asString(stimuliRaw?.neutralFlanker) || "-",
      flankerCount,
    },
    feedbackDefaults,
    conditions: {
      labels,
      quotaPerBlock,
      maxConditionRunLength: toPositiveNumber(conditionsRaw?.maxConditionRunLength, 3),
    },
    blocks,
  };
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
    throw new Error(`Flanker config invalid: quota total (${total}) must equal blockTemplate.trials (${expectedTotal}).`);
  }
  return output;
}

interface PlannedTrial {
  id: string;
  trialIndex: number;
  conditionLabel: FlankerCondition;
  targetDirection: FlankerDirection;
  flankerDirection: FlankerDirection | "neutral";
  stimulusString: string;
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
  configPath: string;
  blockId: string;
  blockLabel: string;
  blockIndex: number;
  trialId: string;
  trialIndex: number;
  conditionLabel: string;
  targetDirection: string;
  flankerDirection: string;
  stimulusString: string;
  correctResponse: string;
  responseKey: string;
  responseRtMs: number;
  responseCorrect: number;
}

function buildFlankerPlan(parsed: ParsedFlankerConfig, baseRng: () => number): PlannedBlock[] {
  const output: PlannedBlock[] = [];

  for (let blockIndex = 0; blockIndex < parsed.blocks.length; blockIndex += 1) {
    const block = parsed.blocks[blockIndex];
    const blockRng = createMulberry32(hashSeed("flanker_block", block.id, String(blockIndex), String(Math.floor(baseRng() * 1e9))));

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
    }).map((cell) => cell.levels.condition as FlankerCondition);

    const plannedTrials = buildBlockTrials({
      parsed,
      block,
      conditionSequence,
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

function buildBlockTrials(args: {
  parsed: ParsedFlankerConfig;
  block: ParsedFlankerConfig["blocks"][number];
  conditionSequence: FlankerCondition[];
  rng: () => number;
}): PlannedTrial[] {
  const { parsed, block, conditionSequence, rng } = args;

  const directions: FlankerDirection[] = ["left", "right"];

  return conditionSequence.map((conditionLabel, idx) => {
    const targetDirection = directions[Math.floor(rng() * directions.length)];
    let flankerDirection: FlankerDirection | "neutral";

    if (conditionLabel === "congruent") {
      flankerDirection = targetDirection;
    } else if (conditionLabel === "incongruent") {
      flankerDirection = targetDirection === "left" ? "right" : "left";
    } else {
      flankerDirection = "neutral";
    }

    const targetChar = targetDirection === "left" ? parsed.stimuli.leftTarget : parsed.stimuli.rightTarget;
    let flankerChar = "";
    if (flankerDirection === "neutral") {
      flankerChar = parsed.stimuli.neutralFlanker;
    } else {
      flankerChar = flankerDirection === "left" ? parsed.stimuli.leftFlanker : parsed.stimuli.rightFlanker;
    }

    const sideCount = Math.floor(parsed.stimuli.flankerCount / 2);
    const leftSide = Array(sideCount).fill(flankerChar).join(String.fromCharCode(160)); // non-breaking space used to pad if spacing > 0 handled in drawing
    const rightSide = Array(sideCount).fill(flankerChar).join(String.fromCharCode(160));

    // the array joining with space is just for simple string logging.
    // actual rendering will use actual layout spacing if needed, but for simplicity we will just draw them as one string with spaces.
    const stimulusString = `${leftSide} ${targetChar} ${rightSide}`;

    return {
      id: `${block.id}_T${idx + 1}`,
      trialIndex: idx,
      conditionLabel,
      targetDirection,
      flankerDirection,
      stimulusString,
      correctResponse: parsed.responseSemantics.keyForCategory(targetDirection) ?? "",
    };
  });
}

function drawFixation(
  canvas: HTMLCanvasElement,
  parsed: ParsedFlankerConfig,
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
  parsed: ParsedFlankerConfig,
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
  parsed: ParsedFlankerConfig,
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
      // Calculate spacing
      const sideCount = Math.floor(parsed.stimuli.flankerCount / 2);

      const targetChar = trial.targetDirection === "left" ? parsed.stimuli.leftTarget : parsed.stimuli.rightTarget;
      let flankerChar = "";
      if (trial.flankerDirection === "neutral") {
        flankerChar = parsed.stimuli.neutralFlanker;
      } else {
        flankerChar = trial.flankerDirection === "left" ? parsed.stimuli.leftFlanker : parsed.stimuli.rightFlanker;
      }

      const spacingPx = parsed.display.stimulusSpacingPx;
      const totalElements = 1 + sideCount * 2;

      // Temporary measure text to find width of a single character. We assume monospaced or roughly equal width for flanker/target.
      frameCtx.font = `${parsed.display.stimulusFontWeight} ${parsed.display.stimulusFontSizePx}px system-ui`;
      const charWidth = frameCtx.measureText(targetChar).width;

      const totalWidth = totalElements * charWidth + (totalElements - 1) * spacingPx;

      let currentX = centerX - totalWidth / 2 + charWidth / 2;

      for (let i = 0; i < totalElements; i++) {
        const char = (i === sideCount) ? targetChar : flankerChar;
        drawCanvasCenteredText(frameCtx, currentX, centerY, char, {
          color: parsed.display.stimulusColor,
          fontSizePx: parsed.display.stimulusFontSizePx,
          fontWeight: parsed.display.stimulusFontWeight,
        });
        currentX += charWidth + spacingPx;
      }
    },
  );
}

function drawFeedback(
  canvas: HTMLCanvasElement,
  parsed: ParsedFlankerConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  feedback: TrialFeedbackConfig,
  feedbackView: { text: string; color: string } | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawTrialFeedbackOnCanvas(ctx, layout, feedback, feedbackView);
}

function appendFlankerTrialTimeline(args: {
  timeline: any[];
  parsed: ParsedFlankerConfig;
  block: PlannedBlock;
  blockIndex: number;
  trial: PlannedTrial;
  participantId: string;
  configPath: string;
  records: TrialRecord[];
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, parsed, block, blockIndex, trial, participantId, configPath, records, eventLogger } = args;
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
      conditionLabel: trial.conditionLabel,
      targetDirection: trial.targetDirection,
      flankerDirection: trial.flankerDirection,
    },
    renderFixation: (canvas: HTMLCanvasElement) => drawFixation(canvas, parsed, layout),
    renderBlank: (canvas: HTMLCanvasElement) => drawBlank(canvas, parsed, layout),
    renderStimulus: (canvas: HTMLCanvasElement) => drawStimulus(canvas, parsed, layout, trial),
    renderFeedback: (canvas: HTMLCanvasElement) => drawFeedback(canvas, parsed, layout, feedback, state.feedbackView),
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
        expectedCategory: trial.targetDirection,
        rt: response.rtMs,
      });

      state.feedbackView = resolveTrialFeedbackView({
        feedback,
        responseCategory,
        correct: outcome.correct,
        vars: {
          expectedCategory: trial.targetDirection,
          conditionLabel: trial.conditionLabel,
          blockLabel: block.label,
        },
      });

      const record: TrialRecord = {
        participantId,
        configPath,
        blockId: block.id,
        blockLabel: block.label,
        blockIndex,
        trialId: trial.id,
        trialIndex: trial.trialIndex,
        conditionLabel: trial.conditionLabel,
        targetDirection: trial.targetDirection,
        flankerDirection: trial.flankerDirection,
        stimulusString: trial.stimulusString,
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
          targetDirection: trial.targetDirection,
          responseKey: record.responseKey,
          responseRtMs: record.responseRtMs,
          responseCorrect: record.responseCorrect,
        },
        { blockIndex, trialIndex: trial.trialIndex },
      );
    },
  });

  for (const node of nodes) {
    timeline.push(node);
  }
}
