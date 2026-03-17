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
  evaluateTrialOutcome,
  hashSeed,
  normalizeKey,
  parseTrialFeedbackConfig,
  buildTaskInstructionConfig,
  resolveTrialFeedbackView,
  runJsPsychTimeline,
  setCursorHidden,
  computeAccuracy,
  TaskOrchestrator,
  createInstructionRenderer,
  StandardTaskInstructionConfig,
  toJsPsychChoices,
  toNonNegativeNumber,
  toPositiveNumber,
  toStringScreens,
  ensureJsPsychCanvasCentered,
  applyTaskInstructionConfig,
  createTaskAdapter,
  buildJsPsychRtTimelineNodes,
  resolveRtTaskConfig,
  maybeExportStimulusRows,
  type ResolvedRtTaskConfig,
  type JSONObject,
  type RtTiming,
  type TaskAdapterContext,
  type TrialFeedbackConfig,
  type ResponseSemantics,
} from "@experiments/core";
import { initJsPsych } from "jspsych";

export type GoNoGoCondition = "go" | "no-go";

export interface ParsedGoNoGoConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  mapping: {
    goKey: string;
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
    frameBackground: string;
    frameBorder: string;
    fixationColor: string;
    fixationFontSizePx: number;
    fixationFontWeight: number;
    stimulusFontSizePx: number;
    stimulusFontWeight: number;
    goStimulusColor: string;
    noGoStimulusColor: string;
  };
  stimuli: {
    goStimuli: string[];
    noGoStimuli: string[];
  };
  feedbackDefaults: TrialFeedbackConfig;
  blocks: Array<{
    id: string;
    label: string;
    trials: number;
    goRatio: number;
    feedback: TrialFeedbackConfig;
    beforeBlockScreens: string[];
  }>;
}

export const parseGoNoGoConfig = (taskConfig: JSONObject): ParsedGoNoGoConfig => {
  const rootObj = asObject(taskConfig.task) ?? {};
  const rootDisplay = asObject(rootObj.display) ?? {};
  const rootMapping = asObject(rootObj.mapping) ?? {};
  const rootStimuli = asObject(rootObj.stimuli) ?? {};
  const baseRtTiming: RtTiming = {
    trialDurationMs: 1500,
    fixationOnsetMs: 0,
    fixationDurationMs: 500,
    stimulusOnsetMs: 500,
    stimulusDurationMs: 500,
    responseWindowStartMs: 500,
    responseWindowEndMs: 1500,
  };

  const rawBlocks = Array.isArray(rootObj.blocks) ? rootObj.blocks : [];
  const goKey = normalizeKey(asString(rootMapping.goKey) ?? " ");

  const allowedKeysSet = new Set<string>();
  if (goKey) allowedKeysSet.add(goKey);
  const allowedKeysArray = Array.from(allowedKeysSet);

  return {
    title: asString(rootObj.title) ?? "Go/No-Go Task",
    instructions: buildTaskInstructionConfig({ title: asString(rootObj.title), instructions: rootObj.instructions }),
    mapping: {
      goKey,
    },
    responseSemantics: createResponseSemantics({
      go: goKey,
    }),
    allowedKeys: allowedKeysArray,
    rtTask: {
      ...resolveRtTaskConfig({
        baseTiming: baseRtTiming,
        override: rootObj.rtTask,
        defaultEnabled: true,
        defaultResponseTerminatesTrial: false,
      }),
      postResponseContent: asString(asObject(rootObj.rtTask)?.postResponseContent) === "stimulus" ? "stimulus" : "blank",
      feedbackPhase: asString(asObject(rootObj.rtTask)?.feedbackPhase) === "separate" ? "separate" : "post_response",
    },
    display: {
      aperturePx: toPositiveNumber(rootDisplay.aperturePx, 400),
      paddingYPx: toPositiveNumber(rootDisplay.paddingYPx, 80),
      frameBackground: asString(rootDisplay.frameBackground) ?? "rgba(255, 255, 255, 1)",
      frameBorder: asString(rootDisplay.frameBorder) ?? "1px solid rgba(0, 0, 0, 0.2)",
      fixationColor: asString(rootDisplay.fixationColor) ?? "#000000",
      fixationFontSizePx: toPositiveNumber(rootDisplay.fixationFontSizePx, 40),
      fixationFontWeight: toPositiveNumber(rootDisplay.fixationFontWeight, 400),
      stimulusFontSizePx: toPositiveNumber(rootDisplay.stimulusFontSizePx, 48),
      stimulusFontWeight: toPositiveNumber(rootDisplay.stimulusFontWeight, 600),
      goStimulusColor: asString(rootDisplay.goStimulusColor) ?? "#2e7d32",
      noGoStimulusColor: asString(rootDisplay.noGoStimulusColor) ?? "#d32f2f",
    },
    stimuli: {
      goStimuli: Array.isArray(rootStimuli.goStimuli)
        ? rootStimuli.goStimuli.map((s) => asString(s)).filter((s): s is string => Boolean(s))
        : ["O"],
      noGoStimuli: Array.isArray(rootStimuli.noGoStimuli)
        ? rootStimuli.noGoStimuli.map((s) => asString(s)).filter((s): s is string => Boolean(s))
        : ["X"],
    },
    feedbackDefaults: parseTrialFeedbackConfig(asObject(rootObj.feedbackDefaults), null),
    blocks: rawBlocks.map((rawBlock, i) => {
      const bObj = asObject(rawBlock) ?? {};
      const baseName = asString(bObj.id) ?? asString(bObj.label) ?? `block${i}`;
      return {
        id: asString(bObj.id) ?? baseName,
        label: asString(bObj.label) ?? baseName,
        trials: toNonNegativeNumber(bObj.trials, 0),
        goRatio: typeof bObj.goRatio === "number" ? Math.max(0, bObj.goRatio) : 0.8,
        feedback: parseTrialFeedbackConfig(asObject(bObj.feedback), null),
        beforeBlockScreens: toStringScreens(bObj.beforeBlockScreens) ?? [],
      };
    }),
  };
};

export interface GoNoGoSequenceCell {
  condition: GoNoGoCondition;
  stimulus: string;
}

export interface GeneratedGoNoGoTrial {
  id: string;
  trialIndex: number;
  block_id: string;
  block_label: string;
  trial_index_in_block: number;
  condition: GoNoGoCondition;
  stimulus: string;
  expectedCategory: string | null;
  cell_id: string;
}

interface PlannedBlock {
  id: string;
  label: string;
  trials: GeneratedGoNoGoTrial[];
  feedback: TrialFeedbackConfig;
  beforeBlockScreens: string[];
}

interface TrialRecord {
  participantId: string;
  variantId: string;
  blockId: string;
  blockLabel: string;
  blockIndex: number;
  trialId: string;
  trialIndex: number;
  condition: GoNoGoCondition;
  stimulus: string;
  expectedCategory: string | null;
  responseKey: string;
  responseRtMs: number;
  responseCorrect: number;
}

export function generateSequence(
  config: ParsedGoNoGoConfig,
  block: ParsedGoNoGoConfig["blocks"][0],
  rng: () => number,
): GoNoGoSequenceCell[] {
  const totalTrials = block.trials;
  if (totalTrials <= 0) return [];

  const goCount = Math.round(totalTrials * block.goRatio);
  const noGoCount = totalTrials - goCount;

  const sequence: GoNoGoSequenceCell[] = [];

  for (let i = 0; i < goCount; i++) {
    const stimulus = config.stimuli.goStimuli[Math.floor(rng() * config.stimuli.goStimuli.length)];
    sequence.push({ condition: "go", stimulus });
  }

  for (let i = 0; i < noGoCount; i++) {
    const stimulus = config.stimuli.noGoStimuli[Math.floor(rng() * config.stimuli.noGoStimuli.length)];
    sequence.push({ condition: "no-go", stimulus });
  }

  for (let i = sequence.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sequence[i], sequence[j]] = [sequence[j], sequence[i]];
  }

  return sequence;
}

function buildGoNoGoPlan(config: ParsedGoNoGoConfig, rng: () => number): PlannedBlock[] {
  return config.blocks
    .filter((block) => block.trials > 0)
    .map((block) => {
      const sequence = generateSequence(config, block, rng);
      const trials: GeneratedGoNoGoTrial[] = sequence.map((cell, i) => ({
        id: `${block.id}_T${i + 1}`,
        trialIndex: i,
        block_id: block.id,
        block_label: block.label,
        trial_index_in_block: i,
        condition: cell.condition,
        stimulus: cell.stimulus,
        expectedCategory: cell.condition === "go" ? "go" : null,
        cell_id: createConditionCellId({ condition: cell.condition, stimulus: cell.stimulus }),
      }));
      return {
        id: block.id,
        label: block.label,
        trials,
        feedback: { ...config.feedbackDefaults, ...block.feedback },
        beforeBlockScreens: block.beforeBlockScreens,
      };
    });
}

export const goNoGoAdapter = createTaskAdapter({
  manifest: {
    taskId: "go_no_go",
    label: "Go/No-Go",
    variants: [],
  },
  run: async (context: TaskAdapterContext) => {
    const config = parseGoNoGoConfig(context.taskConfig);
    const selection = context.selection;
    const participantId = selection.participant.participantId;
    const rng = createMulberry32(hashSeed(participantId, selection.participant.sessionId, selection.variantId, "go_no_go"));
    const records: TrialRecord[] = [];
    const root = context.container;
    const eventLogger = createEventLogger(selection);
    const plannedBlocks = buildGoNoGoPlan(config, rng);

    const rows = plannedBlocks.flatMap((block, blockIndex) =>
      block.trials.map((trial) => ({
        block_index: blockIndex,
        block_id: block.id,
        block_label: block.label,
        trial_index: trial.trialIndex,
        trial_id: trial.id,
        condition: trial.condition,
        stimulus: trial.stimulus,
        expected_category: trial.expectedCategory,
        cell_id: trial.cell_id,
      })),
    );

    const stimulusExport = await maybeExportStimulusRows({
      context,
      rows,
      suffix: "go_no_go_stimulus_list",
    });
    if (stimulusExport) return stimulusExport;

    root.style.maxWidth = "980px";
    root.style.margin = "0 auto";
    root.style.fontFamily = "system-ui";
    ensureJsPsychCanvasCentered(root);

    let jsPsych: ReturnType<typeof initJsPsych> | null = null;
    const orchestrator = new TaskOrchestrator<PlannedBlock, GeneratedGoNoGoTrial, TrialRecord>(context);
    applyTaskInstructionConfig(context.taskConfig, {
      ...config.instructions,
      blockSummary: {
        enabled: true,
        metrics: { correctField: "responseCorrect" },
      },
    });

    const payload = await orchestrator.run({
      buttonIdPrefix: "go-no-go-continue",
      getBlocks: () => plannedBlocks,
      getTrials: ({ block }) => block.trials,
      runTrial: async ({ block, blockIndex, trial }) => {
        if (!jsPsych) throw new Error("jsPsych not initialized");
        const trialTimeline: any[] = [];
        appendGoNoGoTrialTimeline({
          timeline: trialTimeline,
          config,
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
        if (!record) throw new Error(`Go/No-Go record not found for block ${blockIndex} trial ${trial.trialIndex}`);
        return record;
      },
      onTaskStart: () => {
        jsPsych = initJsPsych({ display_element: root });
        eventLogger.emit("task_start", { task: "go_no_go", runner: "jspsych" });
      },
      onBlockStart: ({ block, blockIndex }) => {
        eventLogger.emit("block_start", { blockId: block.id, label: block.label }, { blockIndex });
      },
      onBlockEnd: ({ block, blockIndex }) => {
        const blockRows = records.filter((r) => r.blockIndex === blockIndex);
        const correct = blockRows.reduce((acc, r) => acc + r.responseCorrect, 0);
        const accuracy = computeAccuracy(correct, blockRows.length);
        eventLogger.emit("block_end", { blockId: block.id, label: block.label, accuracy }, { blockIndex });
      },
      onTaskEnd: () => {
        eventLogger.emit("task_end", { task: "go_no_go", trials: records.length });
        setCursorHidden(false);
      },
      csvOptions: {
        suffix: "go_no_go_trials",
        getRecords: () => records,
      },
      getEvents: () => eventLogger.events,
      getTaskMetadata: () => ({
        runner: "jspsych",
        records,
        jsPsychData: jsPsych?.data.get().values() ?? [],
      }),
      renderInstruction: createInstructionRenderer({
        showBlockLabel: config.instructions.showBlockLabel,
      }),
      completeTitle: "Go/No-Go complete",
    });

    return payload;
  },
});

function appendGoNoGoTrialTimeline(args: {
  timeline: any[];
  config: ParsedGoNoGoConfig;
  block: PlannedBlock;
  blockIndex: number;
  trial: GeneratedGoNoGoTrial;
  participantId: string;
  variantId: string;
  records: TrialRecord[];
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, config, block, blockIndex, trial, participantId, variantId, records, eventLogger } = args;
  const layout = computeCanvasFrameLayout({
    aperturePx: config.display.aperturePx,
    paddingYPx: config.display.paddingYPx,
  });
  const feedback = block.feedback;
  const phase = computeRtPhaseDurations(config.rtTask.timing, {
    responseTerminatesTrial: config.rtTask.responseTerminatesTrial,
  });

  const state: { feedbackView: { text: string; color: string } | null } = { feedbackView: null };

  const nodes = buildJsPsychRtTimelineNodes({
    phasePrefix: "",
    responseTerminatesTrial: config.rtTask.responseTerminatesTrial,
    durations: phase,
    canvasSize: [layout.totalHeightPx, config.display.aperturePx],
    allowedKeys: toJsPsychChoices(config.allowedKeys),
    baseData: {
      blockIndex,
      trialIndex: trial.trialIndex,
      blockId: block.id,
      trialId: trial.id,
      condition: trial.condition,
      stimulus: trial.stimulus,
    },
    renderFixation: (canvas: HTMLCanvasElement) => drawFixation(canvas, config, layout),
    renderBlank: (canvas: HTMLCanvasElement) => drawBlank(canvas, config, layout),
    renderStimulus: (canvas: HTMLCanvasElement) => drawStimulus(canvas, config, layout, trial),
    renderFeedback: (canvas: HTMLCanvasElement) => drawFeedback(canvas, config, layout, feedback, state.feedbackView),
    feedback: {
      enabled: feedback.enabled,
      durationMs: feedback.durationMs,
      phaseMode: config.rtTask.feedbackPhase,
    },
    postResponseContent: config.rtTask.postResponseContent,
    onResponse: (response: { key: string | null; rtMs: number | null }, data: Record<string, unknown>) => {
      const responseCategory = config.responseSemantics.responseCategoryFromKey(response.key);
      const outcome = evaluateTrialOutcome({
        responseCategory,
        expectedCategory: trial.expectedCategory,
        rt: response.rtMs,
      });

      state.feedbackView = resolveTrialFeedbackView({
        feedback,
        responseCategory,
        correct: outcome.correct,
        vars: {
          expectedCategory: trial.expectedCategory,
          condition: trial.condition,
          blockLabel: block.label,
        },
      });

      const record: TrialRecord = {
        participantId,
        variantId,
        blockId: block.id,
        blockLabel: block.label,
        blockIndex,
        trialId: trial.id,
        trialIndex: trial.trialIndex,
        condition: trial.condition,
        stimulus: trial.stimulus,
        expectedCategory: trial.expectedCategory,
        responseKey: response.key ?? "",
        responseRtMs: outcome.rt,
        responseCorrect: outcome.correct,
      };
      records.push(record);

      eventLogger.emit(
        "trial_end",
        {
          condition: trial.condition,
          stimulus: trial.stimulus,
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

function drawFixation(
  canvas: HTMLCanvasElement,
  config: ParsedGoNoGoConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCanvasFramedScene(
    ctx,
    layout,
    {
      frameBackground: config.display.frameBackground,
      frameBorder: config.display.frameBorder,
    },
    ({ ctx: frameCtx, centerX, centerY }) => {
      drawCanvasCenteredText(frameCtx, centerX, centerY, "+", {
        color: config.display.fixationColor,
        fontSizePx: config.display.fixationFontSizePx,
        fontWeight: config.display.fixationFontWeight,
      });
    },
  );
}

function drawBlank(
  canvas: HTMLCanvasElement,
  config: ParsedGoNoGoConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCanvasFramedScene(ctx, layout, {
    frameBackground: config.display.frameBackground,
    frameBorder: config.display.frameBorder,
  });
}

function drawStimulus(
  canvas: HTMLCanvasElement,
  config: ParsedGoNoGoConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  trial: GeneratedGoNoGoTrial,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const color = trial.condition === "go" ? config.display.goStimulusColor : config.display.noGoStimulusColor;
  drawCanvasFramedScene(
    ctx,
    layout,
    {
      frameBackground: config.display.frameBackground,
      frameBorder: config.display.frameBorder,
    },
    ({ ctx: frameCtx, centerX, centerY }) => {
      drawCanvasCenteredText(frameCtx, centerX, centerY, trial.stimulus, {
        color,
        fontSizePx: config.display.stimulusFontSizePx,
        fontWeight: config.display.stimulusFontWeight,
      });
    },
  );
}

function drawFeedback(
  canvas: HTMLCanvasElement,
  config: ParsedGoNoGoConfig,
  layout: ReturnType<typeof computeCanvasFrameLayout>,
  feedback: TrialFeedbackConfig,
  feedbackView: { text: string; color: string } | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawTrialFeedbackOnCanvas(ctx, layout, feedback, feedbackView);
}
