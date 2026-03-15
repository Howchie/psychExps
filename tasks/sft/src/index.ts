import {
  QuestBinaryStaircase,
  buildLinearRange,
  buildScheduledItems,
  createMulberry32,
  createEventLogger,
  dbToLuminance,
  drawTrialFeedbackOnCanvas,
  escapeHtml,
  parseTrialFeedbackConfig,
  hashSeed,
  normalizeKey,
  evaluateTrialOutcome,
  computeCanvasFrameLayout,
  drawCanvasFramedScene,
  drawCanvasCenteredText,
  ensureJsPsychCanvasCentered,
  TaskEnvironmentGuard,
  pushJsPsychContinueScreen,
  applyTaskInstructionConfig,
  resolveJsPsychContentHost,
  resolveTrialFeedbackView,
  runJsPsychTimeline,
  setCursorHidden,
  computeAccuracy,
  computeRtPhaseDurations,
  toJsPsychChoices,
  buildTaskInstructionConfig,
  waitForContinue,
  createManipulationPoolAllocator,
  resolveBlockManipulationIds,
  asObject,
  asArray,
  asString,
  asStringArray,
  toPositiveNumber,
  toNonNegativeNumber,
  toUnitNumber,
  toFiniteNumber,
  toNumberArray,
  toStringScreens,
  maybeExportStimulusRows,
  collectSurveyEntries,
  createInstructionRenderer,
  parseSurveyDefinitions,
  runSurveySequence,
  createResponseSemantics,
  coerceBlockSummaryConfig,
  buildBlockSummaryModel,
  renderBlockSummaryCardHtml,
  TaskOrchestrator,
  createTaskAdapter,
  type BlockSummaryConfig,
  type RtTiming,
  type ResponseSemantics,
  type SurveyDefinition,
  type SurveyRunResult,
  type TrialFeedbackConfig,
  type JSONObject,
  type TaskAdapterContext,
  type StandardTaskInstructionConfig,
  shouldHideCursorForPhase,
  extractJsPsychTrialResponse,
} from "@experiments/core";
import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";

const sftManifest = {
  taskId: "sft",
  label: "SFT (DotsExp)",
  variants: [
    { id: "default", label: "Default", configPath: "sft/default" },
    { id: "staircase_example", label: "Staircase Example", configPath: "sft/staircase_example" },
  ],
};

const sftEnvironment = new TaskEnvironmentGuard();

export const sftAdapter = createTaskAdapter({
  manifest: sftManifest,
  run: runSftTask,
  terminate: async () => {
    sftEnvironment.cleanup();
  },
});

interface SftParsedConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  timing: {
    fixationMs: number;
    blankMs: number;
    stimulusMs: number;
    responseDeadlineMs: number;
    responseTerminatesTrial: boolean;
  };
  display: {
    aperturePx: number;
    dotOffsetPx: number;
    dotRadiusPx: number;
    canvasBackground: string;
    canvasBorder: string;
    cueColor: string;
  };
  responses: {
    orYes: string[];
    orNo: string[];
    andYes: string[];
    andNo: string[];
    xorYes: string[];
    xorNo: string[];
    idAB: string[];
    idAN: string[];
    idNB: string[];
    idNN: string[];
  };
  responseSemantics: {
    OR: ResponseSemantics;
    AND: ResponseSemantics;
    XOR: ResponseSemantics;
    ID: ResponseSemantics;
  };
  salience: {
    high: number;
    low: number;
  };
  conditionCodes: string[];
  manipulations: Manipulation[];
  blocks: RawBlock[];
  staircase?: StaircaseSpec | null;
  feedbackDefaults: TrialFeedbackConfig;
  rtTask: {
    enabled: boolean;
    timing: RtTiming;
    fixationJitter: {
      enabled: boolean;
      minMs: number;
      maxMs: number;
    };
    responseTerminatesTrial: boolean;
    postResponseContent: "stimulus" | "blank";
    feedbackPhase: "separate" | "post_response";
  };
  betweenTrialSurveys: SurveyDefinition[];
  blockSummary: BlockSummaryConfig | null;
}

interface Manipulation {
  id: string;
  variants: Variant[];
  schedule: JSONObject;
}

interface Variant {
  id: string;
  rule: "OR" | "AND" | "XOR" | "ID" | "MIXED";
  layout: "ud" | "lr" | "center";
  weight: number;
  trialPool: string[];
  trialPoolSchedule: JSONObject;
  salience: { high: number; low: number };
  showRuleCue: boolean;
  ruleCueLabel: string | null;
}

interface RawBlock {
  id: string;
  label: string;
  nTrials: number;
  manipulationId: string;
  feedback: TrialFeedbackConfig;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
}

interface PlannedBlock {
  id: string;
  label: string;
  rule: string;
  trials: PlannedTrial[];
  feedback: TrialFeedbackConfig;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
}

interface PlannedTrial {
  id: string;
  trialIndex: number;
  rule: "OR" | "AND" | "XOR" | "ID";
  layout: "ud" | "lr" | "center";
  stimCode: string;
  stimCategory: "AB" | "AN" | "NB" | "NN";
  salience: { high: number; low: number };
  showRuleCue: boolean;
  ruleCueLabel: string | null;
}

interface TrialResponse {
  key: string | null;
  rtMs: number | null;
}

interface TrialRecord {
  participantId: string;
  blockId: string;
  blockLabel: string;
  blockRule: string;
  trialId: string;
  trialIndex: number;
  rule: string;
  layout: string;
  stimCode: string;
  channel1: number;
  channel2: number;
  stimCategory: string;
  expectedCategory: string;
  responseCategory: string;
  responseKey: string;
  rt: number;
  correct: number;
}

interface StaircaseSpec {
  enabled: boolean;
  nTrials: number;
  stimDbMin: number;
  stimDbMax: number;
  stimDbStep: number;
  slopeSamples: number[];
  lapseSamples: number[];
  guessRate: number;
  lowScale: number;
  highScale: number;
  clampLuminance: [number, number];
}

interface StaircaseRecord {
  trialIndex: number;
  stimDb: number;
  stimLuminance: number;
  responseKey: string;
  responseCategory: string;
  responseIndex: 0 | 1;
  rt: number;
}

async function runSftTask(context: TaskAdapterContext): Promise<unknown> {
  const parsed = parseSftConfig(context.taskConfig, context.selection);
  const rng = createMulberry32(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, context.selection.variantId, "sft"));
  const root = context.container;
  const plan = buildBlockPlan(parsed, rng);

  const rows = plan.flatMap((block, blockIndex) =>
    block.trials.map((trial) => ({
      block_index: blockIndex,
      block_id: block.id,
      block_label: block.label,
      block_rule: block.rule,
      trial_index: trial.trialIndex,
      trial_id: trial.id,
      rule: trial.rule,
      layout: trial.layout,
      stim_code: trial.stimCode,
      trial_code: trial.stimCode.toLowerCase(),
      stim_category: trial.stimCategory,
      show_rule_cue: trial.showRuleCue,
    })),
  );
  const stimulusExport = await maybeExportStimulusRows({
    context,
    rows,
    suffix: "sft_stimulus_list",
  });
  if (stimulusExport) return stimulusExport;

  root.style.maxWidth = "980px";
  root.style.margin = "0 auto";
  root.style.fontFamily = "system-ui";
  ensureJsPsychCanvasCentered(root);

  const staircaseRecords: StaircaseRecord[] = [];
  const eventLogger = createEventLogger(context.selection);
  const allowedKeys = allKeys(parsed.responseSemantics);
  sftEnvironment.installKeyScrollBlocker(allowedKeys);
  applyGlobalSalience(parsed, parsed.salience);

  let jsPsych: ReturnType<typeof initJsPsych> | null = null;
  const orchestrator = new TaskOrchestrator<PlannedBlock, PlannedTrial, TrialRecord>(context);
  applyTaskInstructionConfig(context.taskConfig, {
    ...parsed.instructions,
    blockSummary: {
      enabled: true,
      metrics: { correctField: "correct" },
    },
  });
  return orchestrator.run({
    buttonIdPrefix: "sft-continue",
    getBlocks: () => plan,
    getTrials: ({ block }) => block.trials,
    runTrial: async ({ block, blockIndex, trial, trialIndex }) => {
      if (!jsPsych) throw new Error("jsPsych not initialized");
      let feedbackView: { text: string; color: string } | null = null;
      const timeline: any[] = [];
      appendDotTrialTimeline({
        timeline,
        config: parsed,
        trialProvider: () => trial,
        allowedKeys,
        rng,
        phasePrefix: "main",
        dataContext: {
          blockId: block.id,
          blockIndex,
          trialId: trial.id,
          trialIndex,
          participantId: context.selection.participant.participantId,
          blockLabel: block.label,
          blockRule: block.rule,
          rule: trial.rule,
          layout: trial.layout,
          stimCode: trial.stimCode,
          stimCategory: trial.stimCategory,
        },
        onResponse: (response, resolvedTrial, trialData) => {
          if (!resolvedTrial) return;
          const responseCategory = classifyResponse(resolvedTrial.rule, response.key, parsed.responseSemantics);
          const expectedCategory = computeCorrectResponse(resolvedTrial.rule, resolvedTrial.stimCategory);
          const [channel1, channel2] = stimCodeToChannels(resolvedTrial.stimCode);
          const outcome = evaluateTrialOutcome({
            responseCategory,
            rt: response.rtMs,
            stimulusCategory: resolvedTrial.stimCategory,
            expectedCategory,
          });
          feedbackView = resolveTrialFeedbackView({
            feedback: block.feedback,
            responseCategory: outcome.responseCategory,
            correct: outcome.correct,
          });

          Object.assign(trialData, {
            participantId: context.selection.participant.participantId,
            blockId: block.id,
            blockLabel: block.label,
            blockRule: block.rule,
            trialId: resolvedTrial.id,
            trialIndex: resolvedTrial.trialIndex,
            rule: resolvedTrial.rule,
            layout: resolvedTrial.layout,
            stimCode: resolvedTrial.stimCode,
            channel1,
            channel2,
            stimCategory: resolvedTrial.stimCategory,
            expectedCategory: outcome.expectedCategory ?? expectedCategory,
            responseCategory: outcome.responseCategory,
            responseKey: response.key ?? "",
            rt: outcome.rt,
            correct: outcome.correct,
            trialType: "sft",
          });

          eventLogger.emit(
            "trial_complete",
            {
              blockId: block.id,
              rule: resolvedTrial.rule,
              trialType: "sft",
              correct: outcome.correct,
              responseKey: response.key ?? "",
              rt: outcome.rt,
              responseCategory: outcome.responseCategory,
            },
            { blockIndex, trialIndex },
          );
        },
        feedback: {
          enabled: block.feedback.enabled,
          config: block.feedback,
          phaseMode: parsed.rtTask.feedbackPhase,
          viewProvider: () => feedbackView,
        },
      });

      const supportsPostResponseFeedback = !parsed.rtTask.responseTerminatesTrial;
      if (
        block.feedback.enabled &&
        block.feedback.durationMs > 0 &&
        !(parsed.rtTask.feedbackPhase === "post_response" && supportsPostResponseFeedback)
      ) {
        timeline.push({
          type: CanvasKeyboardResponsePlugin,
          stimulus: (canvas: HTMLCanvasElement) => {
            drawFeedbackPhase(canvas, parsed, block.feedback, feedbackView);
          },
          canvas_size: [computeCanvasLayout(parsed).totalHeightPx, parsed.display.aperturePx],
          choices: "NO_KEYS",
          response_ends_trial: false,
          trial_duration: block.feedback.durationMs,
          data: {
            blockId: block.id,
            blockIndex,
            trialId: trial.id,
            trialIndex,
            phase: "main_feedback",
          },
        });
      }

      const beforeCount = jsPsych.data.get().values().length;
      await runJsPsychTimeline(jsPsych, timeline);
      const deltaRows = jsPsych.data.get().values().slice(beforeCount) as Array<Record<string, unknown>>;
      const record = collectMainTrialRecords(deltaRows, context.selection.participant.participantId).at(-1);
      if (!record) {
        throw new Error(`SFT trial record missing for block=${block.id}, trial=${trial.id}`);
      }

      const hasNextTrialInBlock = trialIndex < block.trials.length - 1;
      if (hasNextTrialInBlock && parsed.betweenTrialSurveys.length > 0) {
        const host = resolveJsPsychContentHost(root);
        const results = await runSurveySequence(
          host,
          parsed.betweenTrialSurveys,
          `sft-between-${block.id}-${trial.id}-survey-submit`,
        );
        eventLogger.emit(
          "between_trial_survey_complete",
          {
            blockId: block.id,
            trialId: trial.id,
            surveys: results.map((entry) => ({
              surveyId: entry.surveyId,
              answers: entry.answers,
              scores: entry.scores ?? {},
            })),
          },
          { blockIndex, trialIndex },
        );
      }

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
      eventLogger.emit("task_start", { task: "sft", runner: "jspsych" });
    },
    staircase: {
      enabled: parsed.staircase?.enabled ?? false,
      run: async () => {
        if (!jsPsych) return;
        const staircaseTimeline: any[] = [];
        appendStaircaseTimeline({
          timeline: staircaseTimeline,
          container: root,
          config: parsed,
          rng,
          allowedKeys,
          staircaseRecords,
          eventLogger,
        });
        await runJsPsychTimeline(jsPsych, staircaseTimeline);
      },
    },
    onBlockStart: ({ block, blockIndex }) => {
      eventLogger.emit("block_start", { blockId: block.id, label: block.label }, { blockIndex });
    },
    onBlockEnd: async ({ block, blockIndex, trialResults }) => {
      const correct = trialResults.reduce((acc, row) => acc + (row.correct ?? 0), 0);
      const accuracy = computeAccuracy(correct, trialResults.length);
      eventLogger.emit("block_end", { blockId: block.id, accuracy }, { blockIndex });
    },
    onTaskEnd: () => {
      setCursorHidden(false);
    },
    csvOptions: {
      suffix: "sft_trials",
    },
    getEvents: () => eventLogger.events,
    getTaskMetadata: (sessionResult) => {
      const records = sessionResult.blocks.flatMap((b: any) => b.trialResults) as TrialRecord[];
      eventLogger.emit("task_complete", { task: "sft", runner: "jspsych", nTrials: records.length });
      return {
        records,
        staircaseRecords,
        jsPsychData: jsPsych?.data.get().values() ?? [],
      };
    },
    renderInstruction: createInstructionRenderer({
      showBlockLabel: parsed.instructions.showBlockLabel,
      introAppendHtml: () => renderKeySummary(parsed.responses),
    }),
    completeTitle: "SFT complete",
    completeMessage: "Task complete. You can close this tab.",
  });
}

function appendStaircaseTimeline(args: {
  timeline: any[];
  container: HTMLElement;
  config: SftParsedConfig;
  rng: () => number;
  allowedKeys: string[];
  staircaseRecords: StaircaseRecord[];
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, container, config, rng, allowedKeys, staircaseRecords, eventLogger } = args;
  const staircase = config.staircase;
  if (!staircase?.enabled) return;

  pushJsPsychContinueScreen(
    timeline,
    CallFunctionPlugin,
    container,
    "<h3>Adaptive Calibration</h3><p>A short staircase will estimate threshold and update salience levels.</p>",
    "staircase_start",
    "sft-continue-staircase_start",
  );

  const stimDomain = buildLinearRange(staircase.stimDbMin, staircase.stimDbMax, staircase.stimDbStep);
  const quest = new QuestBinaryStaircase({
    stimDomain,
    thresholdDomain: stimDomain,
    slopeDomain: staircase.slopeSamples,
    lapseDomain: staircase.lapseSamples,
    guessRate: staircase.guessRate,
  });

  let activeTrial: { trial: PlannedTrial; trialIndex: number; stimDb: number } | null = null;
  let updatedSalience: { low: number; high: number } = { ...config.salience };
  let thresholdLuminanceEstimate = 0;

  for (let trialIndex = 0; trialIndex < staircase.nTrials; trialIndex += 1) {
    const timelineIndex = trialIndex + 1;

    timeline.push({
      type: CallFunctionPlugin,
      data: { phase: "staircase_prepare", trialIndex: timelineIndex },
      func: () => {
        const stimDb = quest.nextStimulus();
        activeTrial = {
          trialIndex: timelineIndex,
          stimDb,
          trial: {
            id: `STAIR_${String(timelineIndex).padStart(3, "0")}`,
            trialIndex: timelineIndex,
            rule: "OR",
            layout: "center",
            stimCode: "Hx",
            stimCategory: "AN",
            salience: { high: dbToLuminance(stimDb), low: 0 },
            showRuleCue: false,
            ruleCueLabel: null,
          },
        };
      },
    });

    appendDotTrialTimeline({
      timeline,
      config,
      trialProvider: () => activeTrial?.trial ?? null,
      allowedKeys,
      rng,
      phasePrefix: "staircase",
      onResponse: (response, resolvedTrial, trialData) => {
        if (!activeTrial || !resolvedTrial) return;
        const responseCategory = classifyResponse("OR", response.key, config.responseSemantics);
        const responseIndex: 0 | 1 = responseCategory === "yes" ? 0 : 1;
        quest.update(responseIndex);
        Object.assign(trialData, {
          trialType: "staircase",
          rule: resolvedTrial.rule,
          stimCode: resolvedTrial.stimCode,
          stimCategory: resolvedTrial.stimCategory,
          responseCategory,
          responseKey: response.key ?? "",
          rt: response.rtMs ?? -1,
        });
        staircaseRecords.push({
          trialIndex: activeTrial.trialIndex,
          stimDb: activeTrial.stimDb,
          stimLuminance: dbToLuminance(activeTrial.stimDb),
          responseKey: response.key ?? "",
          responseCategory,
          responseIndex,
          rt: response.rtMs ?? -1,
        });
      },
    });
  }

  timeline.push({
    type: CallFunctionPlugin,
    data: { phase: "staircase_finalize" },
    func: () => {
      const estimate = quest.estimateMode();
      const thresholdLum = dbToLuminance(estimate.threshold);
      thresholdLuminanceEstimate = thresholdLum;
      const clampMin = Math.min(staircase.clampLuminance[0], staircase.clampLuminance[1]);
      const clampMax = Math.max(staircase.clampLuminance[0], staircase.clampLuminance[1]);
      const nextLow = clampUnitRange(thresholdLum * staircase.lowScale, clampMin, clampMax);
      const nextHigh = clampUnitRange(thresholdLum * staircase.highScale, clampMin, clampMax);
      updatedSalience = { low: nextLow, high: nextHigh };
      applyGlobalSalience(config, updatedSalience);
      eventLogger.emit("staircase_complete", {
        nTrials: staircaseRecords.length,
        thresholdLuminance: thresholdLum,
        updatedSalience,
      });
    },
  });

  timeline.push({
    type: CallFunctionPlugin,
    data: { phase: "staircase_end" },
    async: true,
    func: (done: () => void) => {
      const host = resolveJsPsychContentHost(container);
      void waitForContinue(
        host,
        `<h3>Calibration Complete</h3><p>Threshold luminance estimate: <b>${thresholdLuminanceEstimate.toFixed(4)}</b></p><p>New levels: low=<b>${updatedSalience.low.toFixed(4)}</b>, high=<b>${updatedSalience.high.toFixed(4)}</b></p>`,
        { buttonId: "sft-staircase-end" },
      ).then(done);
    },
  });
}

function appendDotTrialTimeline(args: {
  timeline: any[];
  config: SftParsedConfig;
  trialProvider: () => PlannedTrial | null;
  allowedKeys: string[];
  rng: () => number;
  phasePrefix: "staircase" | "main";
  onResponse: (response: TrialResponse, trial: PlannedTrial | null, data: Record<string, unknown>) => void;
  dataContext?: Record<string, unknown>;
  feedback?: {
    enabled: boolean;
    config: TrialFeedbackConfig;
    phaseMode: "separate" | "post_response";
    viewProvider: () => { text: string; color: string } | null;
  };
}): void {
  const { timeline, config, trialProvider, allowedKeys, rng, phasePrefix, onResponse, dataContext, feedback } = args;

  const responseTerminatesTrial = config.rtTask.responseTerminatesTrial;
  const fallbackFixationMs = jitter(config.timing.fixationMs, rng);
  const fallbackBlankMs = Math.max(0, config.timing.blankMs);
  const fallbackResponseMs = Math.max(0, config.timing.responseDeadlineMs);
  const fallbackPostMs = Math.max(0, config.timing.stimulusMs);

  const rtPhases = config.rtTask.enabled
    ? computeRtPhaseDurations(config.rtTask.timing, { responseTerminatesTrial })
    : null;
  const preFixationBlankMs = config.rtTask.enabled ? Math.max(0, Math.round(rtPhases?.preFixationBlankMs ?? 0)) : 0;
  const fixationMs = config.rtTask.enabled
    ? config.rtTask.fixationJitter.enabled
      ? randomInt(config.rtTask.fixationJitter.minMs, config.rtTask.fixationJitter.maxMs, rng)
      : Math.max(0, Math.round(rtPhases?.fixationMs ?? 0))
    : fallbackFixationMs;
  const blankMs = config.rtTask.enabled ? Math.max(0, Math.round(rtPhases?.blankMs ?? 0)) : fallbackBlankMs;
  const responseWindowMs = config.rtTask.enabled ? Math.max(0, Math.round(rtPhases?.responseMs ?? 0)) : fallbackResponseMs;
  const responsePreStimBlankMs = config.rtTask.enabled
    ? Math.max(0, Math.round(rtPhases?.responsePreStimulusBlankMs ?? 0))
    : 0;
  const responseStimulusMs = config.rtTask.enabled
    ? Math.max(0, Math.round(rtPhases?.responseStimulusMs ?? 0))
    : responseWindowMs;
  const responsePostStimBlankMs = config.rtTask.enabled
    ? Math.max(0, Math.round(rtPhases?.responsePostStimulusBlankMs ?? 0))
    : 0;
  const postResponseStimulusMs = responseTerminatesTrial
    ? 0
    : config.rtTask.enabled
      ? Math.max(0, Math.round(rtPhases?.postResponseStimulusMs ?? 0))
      : fallbackPostMs;
  const postResponseBlankMs = responseTerminatesTrial
    ? 0
    : config.rtTask.enabled
      ? Math.max(0, Math.round(rtPhases?.postResponseBlankMs ?? 0))
      : 0;

  const baseData = dataContext ?? {};
  const layout = computeCanvasLayout(config);
  const jsPsychAllowedKeys = toJsPsychChoices(allowedKeys);

  if (preFixationBlankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        const trial = trialProvider();
        drawBlankPhase(canvas, config, trial);
      },
      canvas_size: [layout.totalHeightPx, config.display.aperturePx],
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: preFixationBlankMs,
      data: { ...baseData, phase: `${phasePrefix}_pre_fixation_blank` },
    });
  }

  timeline.push({
    type: CanvasKeyboardResponsePlugin,
    stimulus: (canvas: HTMLCanvasElement) => {
      const trial = trialProvider();
      drawFixationPhase(canvas, config, trial);
    },
    canvas_size: [layout.totalHeightPx, config.display.aperturePx],
    choices: "NO_KEYS",
    response_ends_trial: false,
    trial_duration: fixationMs,
    data: { ...baseData, phase: `${phasePrefix}_fixation` },
  });

  timeline.push({
    type: CanvasKeyboardResponsePlugin,
    stimulus: (canvas: HTMLCanvasElement) => {
      const trial = trialProvider();
      drawBlankPhase(canvas, config, trial);
    },
    canvas_size: [layout.totalHeightPx, config.display.aperturePx],
    choices: "NO_KEYS",
    response_ends_trial: false,
    trial_duration: blankMs,
    data: { ...baseData, phase: `${phasePrefix}_blank` },
  });

  const responseSegments: Array<{ phase: string; durationMs: number; showStimulus: boolean }> = [];
  if (!responseTerminatesTrial && config.rtTask.enabled) {
    if (responsePreStimBlankMs > 0) {
      responseSegments.push({
        phase: `${phasePrefix}_response_window_pre_stim_blank`,
        durationMs: responsePreStimBlankMs,
        showStimulus: false,
      });
    }
    if (responseStimulusMs > 0) {
      responseSegments.push({
        phase: `${phasePrefix}_response_window_stimulus`,
        durationMs: responseStimulusMs,
        showStimulus: true,
      });
    }
    if (responsePostStimBlankMs > 0) {
      responseSegments.push({
        phase: `${phasePrefix}_response_window_post_stim_blank`,
        durationMs: responsePostStimBlankMs,
        showStimulus: false,
      });
    }
  }
  if (responseSegments.length === 0) {
    responseSegments.push({
      phase: `${phasePrefix}_response_window`,
      durationMs: responseWindowMs,
      showStimulus: true,
    });
  }

  let capturedResponse: TrialResponse = { key: null, rtMs: null };
  let responseSeen = false;
  responseSegments.forEach((segment, segmentIndex) => {
    const isLast = segmentIndex === responseSegments.length - 1;
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: (canvas: HTMLCanvasElement) => {
        const trial = trialProvider();
        if (segment.showStimulus) {
          drawStimulusPhase(canvas, config, trial);
        } else {
          drawBlankPhase(canvas, config, trial);
        }
      },
      canvas_size: [layout.totalHeightPx, config.display.aperturePx],
      choices: jsPsychAllowedKeys,
      response_ends_trial: responseTerminatesTrial,
      trial_duration: segment.durationMs,
      data: { ...baseData, phase: segment.phase },
      on_finish: (data: Record<string, unknown>) => {
        if (!responseSeen) {
          const response = extractTrialResponse(data);
          if (response.key || response.rtMs != null) {
            capturedResponse = response;
            responseSeen = true;
          }
        }
        if (isLast) {
          onResponse(capturedResponse, trialProvider(), data);
        }
      },
    });
  });

  if (!responseTerminatesTrial) {
    if (feedback?.enabled && feedback.phaseMode === "post_response" && feedback.config.durationMs > 0) {
      timeline.push({
        type: CanvasKeyboardResponsePlugin,
        stimulus: (canvas: HTMLCanvasElement) => {
          drawFeedbackPhase(canvas, config, feedback.config, feedback.viewProvider());
        },
        canvas_size: [layout.totalHeightPx, config.display.aperturePx],
        choices: "NO_KEYS",
        response_ends_trial: false,
        trial_duration: Math.max(0, feedback.config.durationMs),
        data: { ...baseData, phase: `${phasePrefix}_post_response_feedback` },
      });
    } else {
      const postStimMs =
        config.rtTask.enabled && config.rtTask.postResponseContent === "blank" ? 0 : postResponseStimulusMs;
      const postBlankMs =
        config.rtTask.enabled && config.rtTask.postResponseContent === "blank"
          ? postResponseStimulusMs + postResponseBlankMs
          : postResponseBlankMs;
      if (postStimMs > 0) {
        timeline.push({
          type: CanvasKeyboardResponsePlugin,
          stimulus: (canvas: HTMLCanvasElement) => {
            const trial = trialProvider();
            drawStimulusPhase(canvas, config, trial);
          },
          canvas_size: [layout.totalHeightPx, config.display.aperturePx],
          choices: "NO_KEYS",
          response_ends_trial: false,
          trial_duration: postStimMs,
          data: { ...baseData, phase: `${phasePrefix}_post_response_stimulus` },
        });
      }
      if (postBlankMs > 0) {
        timeline.push({
          type: CanvasKeyboardResponsePlugin,
          stimulus: (canvas: HTMLCanvasElement) => {
            const trial = trialProvider();
            drawBlankPhase(canvas, config, trial);
          },
          canvas_size: [layout.totalHeightPx, config.display.aperturePx],
          choices: "NO_KEYS",
          response_ends_trial: false,
          trial_duration: postBlankMs,
          data: { ...baseData, phase: `${phasePrefix}_post_response_blank` },
        });
      }
    }
  }
}

function extractTrialResponse(data: Record<string, unknown>): TrialResponse {
  const rawKey = data.response;
  const rawRt = data.rt;

  const key = typeof rawKey === "string" ? normalizeKey(rawKey) : null;
  const rtMs = typeof rawRt === "number" && Number.isFinite(rawRt) ? rawRt : null;
  return { key, rtMs };
}

function applyGlobalSalience(config: SftParsedConfig, salience: { low: number; high: number }): void {
  config.salience = { ...salience };
  for (const manipulation of config.manipulations) {
    for (const variant of manipulation.variants) {
      variant.salience = { ...salience };
    }
  }
}

function parseSftConfig(config: JSONObject, selection: TaskAdapterContext["selection"]): SftParsedConfig {
  const design = asObject(config.design);
  const instructionsRaw = asObject(config.instructions);
  const manipRaw = asArray(design?.manipulations);
  const blockRaw = asArray(design?.blocks);
  if (manipRaw.length === 0) throw new Error("SFT config invalid: design.manipulations is empty.");
  if (blockRaw.length === 0) throw new Error("SFT config invalid: design.blocks is empty.");

  const responsesRaw = asObject(config.responses);
  const keysRaw = asObject(responsesRaw?.keys);
  const idRaw = asObject(keysRaw?.ID);

  const manipulations = manipRaw.map((raw, idx) => parseManipulation(raw, idx, config));
  const feedbackDefaults = parseTrialFeedbackConfig(asObject(config.feedback), null);
  const known = new Set(manipulations.map((m) => m.id));
  const poolAllocator = createManipulationPoolAllocator(
    design?.manipulationPools,
    [
      selection.participant.participantId,
      selection.participant.sessionId,
      selection.variantId,
      "sft_design_manipulation_pools",
    ],
  );
  const blocks = blockRaw.map((raw, idx) => {
    const b = asObject(raw);
    if (!b) throw new Error(`Invalid SFT block ${idx + 1}`);
    const id = asString(b.id) || asString(b.block_id) || `BLOCK_${idx + 1}`;
    const label = asString(b.label) || id;
    const nTrials = toPositiveNumber(b.nTrials ?? b.n_trials, 36);
    const manipulationIds = resolveBlockManipulationIds(b, poolAllocator);
    const manipulationId = manipulationIds.length > 0 ? manipulationIds[0] : asString(b.manipulation) || manipulations[0].id;
    if (manipulationIds.length > 1) {
      throw new Error(`SFT block '${id}' resolved multiple manipulations; SFT blocks must resolve exactly one manipulation.`);
    }
    if (!known.has(manipulationId)) throw new Error(`Unknown manipulation '${manipulationId}' in block '${id}'.`);
    const feedback = parseTrialFeedbackConfig(asObject(b.feedback), feedbackDefaults);
    const rawBeforeBlockScreens = b.beforeBlockScreens ?? b.preBlockInstructions;
    const rawAfterBlockScreens = b.afterBlockScreens ?? b.postBlockInstructions;
    const beforeBlockScreens = toStringScreens(rawBeforeBlockScreens);
    const afterBlockScreens = toStringScreens(rawAfterBlockScreens);
    return { id, label, nTrials, manipulationId, feedback, beforeBlockScreens, afterBlockScreens };
  });

  const stimulusRaw = asObject(config.stimulus);
  const salienceRaw = asObject(stimulusRaw?.salience_levels);
  const conditionCodes = asArray(stimulusRaw?.condition_codes).map((v) => asString(v)).filter((v): v is string => Boolean(v));
  const legacyTiming = {
    fixationMs: toNonNegativeNumber(asObject(config.timing)?.fixation_truncexp ? (asObject(asObject(config.timing)?.fixation_truncexp)?.mean ?? 500) : 500, 500),
    blankMs: toNonNegativeNumber(asObject(config.timing)?.blank_ms, 66),
    stimulusMs: toPositiveNumber(asObject(config.timing)?.stimulus_ms, 100),
    responseDeadlineMs: toPositiveNumber(asObject(config.timing)?.response_deadline_ms, 3000),
    responseTerminatesTrial: asObject(config.timing)?.response_terminates_trial !== false,
  };
  const rtTask = parseSftRtTaskConfig(config, legacyTiming);
  const blockSummary = coerceBlockSummaryConfig(asObject(asObject(config.instructions)?.blockSummary)) ??
    coerceBlockSummaryConfig({
      enabled: true,
      at: "before_post",
      title: "End of {blockLabel}",
      lines: ["Accuracy: {accuracyPct}% ({correct}/{total})"],
      metrics: { correctField: "correct", rtField: "rt" },
    });
  const responses = {
    orYes: asStringArray(asObject(keysRaw?.OR)?.yes, ["a"]),
    orNo: asStringArray(asObject(keysRaw?.OR)?.no, ["l"]),
    andYes: asStringArray(asObject(keysRaw?.AND)?.yes, ["a"]),
    andNo: asStringArray(asObject(keysRaw?.AND)?.no, ["l"]),
    xorYes: asStringArray(asObject(keysRaw?.XOR)?.yes, ["a"]),
    xorNo: asStringArray(asObject(keysRaw?.XOR)?.no, ["l"]),
    idAB: asStringArray(idRaw?.AB, ["q"]),
    idAN: asStringArray(idRaw?.AN, ["w"]),
    idNB: asStringArray(idRaw?.NB, ["o"]),
    idNN: asStringArray(idRaw?.NN, ["p"]),
  };
  const responseSemantics = {
    OR: createResponseSemantics({
      yes: responses.orYes,
      no: responses.orNo,
    }),
    AND: createResponseSemantics({
      yes: responses.andYes,
      no: responses.andNo,
    }),
    XOR: createResponseSemantics({
      yes: responses.xorYes,
      no: responses.xorNo,
    }),
    ID: createResponseSemantics({
      AB: responses.idAB,
      AN: responses.idAN,
      NB: responses.idNB,
      NN: responses.idNN,
    }),
  };
  const instructionConfig = buildTaskInstructionConfig({
    title: asString(asObject(config.task)?.title) || "SFT Task",
    instructions: instructionsRaw,
    defaults: {
      intro: [
        asString(asObject(config.task)?.instructions) ||
          "Respond according to the block rule. OR/AND/XOR use yes/no keys; ID uses four category keys.",
      ],
    },
    blockIntroTemplateDefault: "Rule: {blockRule}. Trials: {nTrials}.",
  });
  return {
    title: asString(asObject(config.task)?.title) || "SFT Task",
    instructions: instructionConfig,
    timing: {
      fixationMs: legacyTiming.fixationMs,
      blankMs: legacyTiming.blankMs,
      stimulusMs: legacyTiming.stimulusMs,
      responseDeadlineMs: legacyTiming.responseDeadlineMs,
      responseTerminatesTrial: legacyTiming.responseTerminatesTrial,
    },
    display: {
      aperturePx: toPositiveNumber(asObject(config.display)?.aperture_px, 250),
      dotOffsetPx: toPositiveNumber(asObject(config.display)?.dot_offset_px, 44),
      dotRadiusPx: toPositiveNumber(asObject(config.display)?.dot_radius_px, 7),
      canvasBackground: asString(asObject(config.display)?.canvas_background) || "#000000",
      canvasBorder: asString(asObject(config.display)?.canvas_border) || "2px solid #444",
      cueColor: asString(asObject(config.display)?.cue_color) || "#0f172a",
    },
    responses,
    responseSemantics,
    salience: {
      high: toUnitNumber(salienceRaw?.high, 0.7),
      low: toUnitNumber(salienceRaw?.low, 0.2),
    },
    conditionCodes: conditionCodes.length > 0 ? conditionCodes : ["HH", "HL", "LH", "LL", "Hx", "Lx", "xH", "xL", "xx"],
    manipulations,
    blocks,
    staircase: parseStaircase(config),
    feedbackDefaults,
    rtTask,
    betweenTrialSurveys: parseBetweenTrialSurveys(config),
    blockSummary,
  };
}

function parseBetweenTrialSurveys(config: JSONObject): SurveyDefinition[] {
  const betweenTrial = collectSurveyEntries(config, {
    arrayKey: "betweenTrial",
    singletonKey: "",
  });
  return parseSurveyDefinitions(betweenTrial);
}

function parseSftRtTaskConfig(
  config: JSONObject,
  legacyTiming: {
    fixationMs: number;
    blankMs: number;
    stimulusMs: number;
    responseDeadlineMs: number;
    responseTerminatesTrial: boolean;
  },
): SftParsedConfig["rtTask"] {
  const taskRaw = asObject(config.task);
  const rtRaw = asObject(taskRaw?.rtTask);
  const enabled = rtRaw ? rtRaw.enabled !== false : false;

  const legacyTrialDuration = Math.max(
    1,
    legacyTiming.fixationMs +
      legacyTiming.blankMs +
      legacyTiming.responseDeadlineMs +
      (legacyTiming.responseTerminatesTrial ? 0 : legacyTiming.stimulusMs),
  );
  const timingRaw = asObject(rtRaw?.timing);
  const timing: RtTiming = {
    trialDurationMs: toPositiveNumber(timingRaw?.trialDurationMs, legacyTrialDuration),
    fixationOnsetMs: toNonNegativeNumber(timingRaw?.fixationOnsetMs, 0),
    fixationDurationMs: toNonNegativeNumber(timingRaw?.fixationDurationMs, legacyTiming.fixationMs),
    stimulusOnsetMs: toNonNegativeNumber(timingRaw?.stimulusOnsetMs, legacyTiming.fixationMs + legacyTiming.blankMs),
    stimulusDurationMs: toNonNegativeNumber(
      timingRaw?.stimulusDurationMs,
      Math.max(0, toPositiveNumber(timingRaw?.trialDurationMs, legacyTrialDuration) - toNonNegativeNumber(timingRaw?.stimulusOnsetMs, legacyTiming.fixationMs + legacyTiming.blankMs)),
    ),
    responseWindowStartMs: toNonNegativeNumber(
      timingRaw?.responseWindowStartMs,
      legacyTiming.fixationMs + legacyTiming.blankMs,
    ),
    responseWindowEndMs: toNonNegativeNumber(
      timingRaw?.responseWindowEndMs,
      legacyTiming.fixationMs + legacyTiming.blankMs + legacyTiming.responseDeadlineMs,
    ),
  };

  const jitterRaw = asObject(rtRaw?.fixationJitter);
  const defaultJitterMin = Math.max(0, Math.round(legacyTiming.fixationMs * 0.5));
  const defaultJitterMax = Math.max(defaultJitterMin + 1, Math.round(legacyTiming.fixationMs * 1.5));
  const jitterMin = toNonNegativeNumber(jitterRaw?.minMs, defaultJitterMin);
  const jitterMax = Math.max(jitterMin, toNonNegativeNumber(jitterRaw?.maxMs, defaultJitterMax));

  const postResponseContentRaw = (asString(rtRaw?.postResponseContent) || "").toLowerCase();
  const feedbackPhaseRaw = (asString(rtRaw?.feedbackPhase) || "").toLowerCase();
  return {
    enabled,
    timing,
    fixationJitter: {
      enabled: jitterRaw ? jitterRaw.enabled !== false : false,
      minMs: jitterMin,
      maxMs: jitterMax,
    },
    responseTerminatesTrial: rtRaw
      ? rtRaw.responseTerminatesTrial !== false
      : legacyTiming.responseTerminatesTrial,
    postResponseContent: postResponseContentRaw === "blank" ? "blank" : "stimulus",
    feedbackPhase: feedbackPhaseRaw === "post_response" ? "post_response" : "separate",
  };
}

function parseStaircase(config: JSONObject): StaircaseSpec | null {
  const raw = asObject(config.staircase);
  if (!raw) return null;
  const enabled = Boolean(raw.enabled);
  return {
    enabled,
    nTrials: toPositiveNumber(raw.n_trials ?? raw.nTrials, 20),
    stimDbMin: toFiniteNumber(raw.stim_db_min, -2.5),
    stimDbMax: toFiniteNumber(raw.stim_db_max, -0.2),
    stimDbStep: Math.max(0.001, Math.abs(toFiniteNumber(raw.stim_db_step, 0.1))),
    slopeSamples: toNumberArray(raw.slope_samples, [1, 1.5, 2, 2.5, 3, 3.5]),
    lapseSamples: toNumberArray(raw.lapse_samples, [0, 0.01, 0.02, 0.04]),
    guessRate: Math.max(0, Math.min(1, toFiniteNumber(raw.guess_rate ?? raw.guess, 0.5))),
    lowScale: Math.max(0, toFiniteNumber(raw.low_scale, 0.6)),
    highScale: Math.max(0, toFiniteNumber(raw.high_scale, 1.3)),
    clampLuminance: [
      Math.max(0.00001, toFiniteNumber(asArray(raw.clamp_luminance)[0], 0.01)),
      Math.max(0.00001, toFiniteNumber(asArray(raw.clamp_luminance)[1], 0.95)),
    ],
  };
}

function parseManipulation(raw: unknown, index: number, config: JSONObject): Manipulation {
  const m = asObject(raw);
  if (!m) throw new Error(`Invalid manipulation at index ${index}`);
  const id = asString(m.id) || `manip_${index + 1}`;
  const trialPlan = asObject(m.trialPlan) ?? asObject(m.trial_plan);
  const variantsRaw = asArray(trialPlan?.variants);
  const schedule = asObject(trialPlan?.schedule) || { mode: "weighted" };
  let variants = (variantsRaw.length > 0 ? variantsRaw : [m]).map((entry, vIndex) => {
    const v = asObject(entry) || {};
    const ruleRaw = (asString(v.rule) || "OR").toUpperCase();
    const rule = (["OR", "AND", "XOR", "ID", "MIXED"].includes(ruleRaw) ? ruleRaw : "OR") as Variant["rule"];
    const layoutRaw = (asString(v.layout) || asString(asObject(config.display)?.dot_positions_mode) || "ud").toLowerCase();
    const layout = (layoutRaw === "lr" || layoutRaw === "center" ? layoutRaw : "ud") as Variant["layout"];
    const localSal = asObject(v.salience_levels);
    const defaultSal = asObject(asObject(config.stimulus)?.salience_levels);
    const pool = asArray(v.trial_pool).map((code) => asString(code)).filter((code): code is string => Boolean(code));
    return {
      id: asString(v.id) || `${id}_v${vIndex + 1}`,
      rule,
      layout,
      weight: toPositiveNumber(v.weight, 1),
      trialPool: pool.length > 0 ? pool : [],
      trialPoolSchedule: asObject(v.trial_pool_schedule) || { mode: "quota_shuffle" },
      salience: {
        high: toUnitNumber(localSal?.high ?? defaultSal?.high, 0.7),
        low: toUnitNumber(localSal?.low ?? defaultSal?.low, 0.2),
      },
      showRuleCue: Boolean(v.show_rule_cue ?? v.showRuleCue),
      ruleCueLabel: asString(v.rule_cue_label ?? v.ruleCueLabel),
    };
  });

  if (variantsRaw.length === 0 && variants.length === 1 && variants[0].rule === "MIXED") {
    const base = variants[0];
    variants = (["OR", "AND", "XOR"] as const).map((rule, idx) => ({
      ...base,
      id: `${id}_mixed_${idx + 1}`,
      rule,
      weight: 1,
      showRuleCue: true,
      ruleCueLabel: rule,
    }));
  }
  return { id, variants, schedule };
}

function buildBlockPlan(config: SftParsedConfig, rng: () => number): PlannedBlock[] {
  const manipulationMap = new Map(config.manipulations.map((m) => [m.id, m]));
  return config.blocks.map((block) => {
    const manipulation = manipulationMap.get(block.manipulationId);
    if (!manipulation) throw new Error(`Missing manipulation '${block.manipulationId}'.`);
    const variants = manipulation.variants;
    const variantSchedule = buildScheduledItems({
      items: variants,
      count: block.nTrials,
      schedule: manipulation.schedule,
      weights: variants.map((v) => v.weight),
      rng: { next: rng },
      resolveToken: (token: unknown) => {
        if (Number.isInteger(token) && Number(token) >= 0 && Number(token) < variants.length) return variants[Number(token)];
        if (typeof token === "string") return variants.find((v) => v.id === token.trim()) ?? null;
        return null;
      },
    }) as Variant[];

    const variantCounts = new Map<Variant, number>();
    for (let i = 0; i < variantSchedule.length; i++) {
      const variant = variantSchedule[i];
      variantCounts.set(variant, (variantCounts.get(variant) ?? 0) + 1);
    }

    const plannedStimuli = new Map<Variant, string[]>();
    const plannedStimulusIndex = new Map<Variant, number>();
    for (const [variant, countForVariant] of variantCounts) {
      const pool = variant.trialPool.length > 0 ? variant.trialPool : config.conditionCodes;
      const schedule = buildScheduledItems({
        items: pool,
        count: countForVariant,
        schedule: variant.trialPoolSchedule,
        weights: pool.map(() => 1),
        rng: { next: rng },
      }) as string[];
      plannedStimuli.set(variant, schedule);
      plannedStimulusIndex.set(variant, 0);
    }

    const trials = variantSchedule.map((variant, trialIndex) => {
      const variantScheduleList = plannedStimuli.get(variant) ?? config.conditionCodes;
      const nextIndex = plannedStimulusIndex.get(variant) ?? 0;
      const stimCode = variantScheduleList[nextIndex] ?? config.conditionCodes[0];
      plannedStimulusIndex.set(variant, nextIndex + 1);
      const category = inferCategoryFromStimCode(stimCode);
      return {
        id: `T_${block.id}_${String(trialIndex + 1).padStart(4, "0")}`,
        trialIndex: trialIndex + 1,
        rule: variant.rule === "MIXED" ? "OR" : variant.rule,
        layout: variant.layout,
        stimCode,
        stimCategory: category,
        salience: variant.salience,
        showRuleCue: variant.showRuleCue,
        ruleCueLabel: variant.ruleCueLabel,
      };
    });

    let rule = trials.length > 0 ? trials[0].rule : "MIXED";
    for (let i = 1; i < trials.length; i++) {
      if (trials[i].rule !== rule) {
        rule = "MIXED";
        break;
      }
    }

    return {
      id: block.id,
      label: block.label,
      rule,
      trials,
      feedback: block.feedback,
      beforeBlockScreens: block.beforeBlockScreens,
      afterBlockScreens: block.afterBlockScreens,
    };
  });
}

function computeCanvasLayout(config: SftParsedConfig) {
  return computeCanvasFrameLayout({
    aperturePx: config.display.aperturePx,
    paddingYPx: 16,
    cueHeightPx: 24,
    cueMarginBottomPx: 6,
  });
}

function cueTextForTrial(trial: PlannedTrial | null): string {
  if (!trial?.showRuleCue) return "";
  return `Rule: ${trial.ruleCueLabel || trial.rule}`;
}

function drawFixationPhase(canvas: HTMLCanvasElement, config: SftParsedConfig, trial: PlannedTrial | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const layout = computeCanvasLayout(config);
  drawCanvasFramedScene(ctx, layout, {
    cueText: cueTextForTrial(trial),
    cueColor: config.display.cueColor,
    frameBackground: config.display.canvasBackground,
    frameBorder: config.display.canvasBorder,
  }, ({ centerX, centerY }) => {
    drawCanvasCenteredText(ctx, centerX, centerY, "+", {
      color: "#ffffff",
      fontSizePx: 36,
      fontWeight: 700,
    });
  });
}

function drawBlankPhase(canvas: HTMLCanvasElement, config: SftParsedConfig, trial: PlannedTrial | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const layout = computeCanvasLayout(config);
  drawCanvasFramedScene(ctx, layout, {
    cueText: cueTextForTrial(trial),
    cueColor: config.display.cueColor,
    frameBackground: config.display.canvasBackground,
    frameBorder: config.display.canvasBorder,
  });
}

function drawStimulusPhase(canvas: HTMLCanvasElement, config: SftParsedConfig, trial: PlannedTrial | null): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const layout = computeCanvasLayout(config);
  drawCanvasFramedScene(ctx, layout, {
    cueText: cueTextForTrial(trial),
    cueColor: config.display.cueColor,
    frameBackground: config.display.canvasBackground,
    frameBorder: config.display.canvasBorder,
  }, ({ centerX, centerY }) => {
    if (!trial) return;
    const positions = dotPositions(centerX, centerY, trial.layout, config.display.dotOffsetPx);
    const dots = dotsFromStimCode(trial.stimCode, trial.salience);
    for (const dot of dots) {
      const p = positions[dot.loc];
      ctx.beginPath();
      ctx.arc(p.x, p.y, config.display.dotRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = luminanceToGray(dot.luminance);
      ctx.fill();
    }
  });
}

function drawFeedbackPhase(
  canvas: HTMLCanvasElement,
  config: SftParsedConfig,
  feedback: TrialFeedbackConfig,
  view: { text: string; color: string } | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const layout = computeCanvasLayout(config);
  drawTrialFeedbackOnCanvas(ctx, layout, feedback, view);
}

function renderKeySummary(responses: SftParsedConfig["responses"]): string {
  const fmt = (keys: string[]) => keys.map((key) => escapeHtml(key.toUpperCase())).join(", ");
  return [
    "<p><b>Response Keys</b></p>",
    `<p>OR: yes=${fmt(responses.orYes)} | no=${fmt(responses.orNo)}</p>`,
    `<p>AND: yes=${fmt(responses.andYes)} | no=${fmt(responses.andNo)}</p>`,
    `<p>XOR: yes=${fmt(responses.xorYes)} | no=${fmt(responses.xorNo)}</p>`,
    `<p>ID: AB=${fmt(responses.idAB)} | AN=${fmt(responses.idAN)} | NB=${fmt(responses.idNB)} | NN=${fmt(responses.idNN)}</p>`,
  ].join("");
}

function computeCorrectResponse(rule: PlannedTrial["rule"], stimCategory: PlannedTrial["stimCategory"]): string {
  if (rule === "OR") return stimCategory === "NN" ? "no" : "yes";
  if (rule === "AND") return stimCategory === "AB" ? "yes" : "no";
  if (rule === "XOR") return stimCategory === "AN" || stimCategory === "NB" ? "yes" : "no";
  return stimCategory;
}

function classifyResponse(
  rule: PlannedTrial["rule"],
  key: string | null,
  semantics: SftParsedConfig["responseSemantics"],
): string {
  if (rule === "OR") return semantics.OR.responseCategoryFromKey(key);
  if (rule === "AND") return semantics.AND.responseCategoryFromKey(key);
  if (rule === "XOR") return semantics.XOR.responseCategoryFromKey(key);
  return semantics.ID.responseCategoryFromKey(key);
}

function dotsFromStimCode(stimCode: string, salience: { high: number; low: number }): Array<{ loc: "A" | "B"; luminance: number }> {
  const [a, b] = normalizeStimCode(stimCode).split("");
  const dots: Array<{ loc: "A" | "B"; luminance: number }> = [];
  if (a !== "x") dots.push({ loc: "A", luminance: a === "H" ? salience.high : salience.low });
  if (b !== "x") dots.push({ loc: "B", luminance: b === "H" ? salience.high : salience.low });
  return dots;
}

function inferCategoryFromStimCode(stimCode: string): "AB" | "AN" | "NB" | "NN" {
  const [a, b] = normalizeStimCode(stimCode).split("");
  const c1 = a === "x" ? 0 : 1;
  const c2 = b === "x" ? 0 : 1;
  if (c1 > 0 && c2 > 0) return "AB";
  if (c1 > 0 && c2 === 0) return "AN";
  if (c1 === 0 && c2 > 0) return "NB";
  return "NN";
}

function normalizeStimCode(stimCode: string): string {
  const s = String(stimCode || "").trim();
  if (s.length !== 2) return "xx";
  const a = s[0] === "X" ? "x" : s[0];
  const b = s[1] === "X" ? "x" : s[1];
  return `${a}${b}`;
}

function stimCharToChannelValue(ch: string): number {
  if (ch === "H") return 2;
  if (ch === "L") return 1;
  return 0;
}

function stimCodeToChannels(stimCode: string): [number, number] {
  const [a, b] = normalizeStimCode(stimCode).split("");
  return [stimCharToChannelValue(a), stimCharToChannelValue(b)];
}

function dotPositions(centerX: number, centerY: number, mode: "ud" | "lr" | "center", offsetPx: number): Record<"A" | "B", { x: number; y: number }> {
  if (mode === "lr") return { A: { x: centerX - offsetPx, y: centerY }, B: { x: centerX + offsetPx, y: centerY } };
  if (mode === "center") return { A: { x: centerX, y: centerY }, B: { x: centerX, y: centerY } };
  return { A: { x: centerX, y: centerY - offsetPx }, B: { x: centerX, y: centerY + offsetPx } };
}

function luminanceToGray(level: number): string {
  const v = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(1, level)) * 255)));
  return `rgb(${v},${v},${v})`;
}

function allKeys(semantics: SftParsedConfig["responseSemantics"]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const groups: ResponseSemantics[] = [semantics.OR, semantics.AND, semantics.XOR, semantics.ID];
  for (const group of groups) {
    for (const key of group.allowedKeys()) {
      const normalized = normalizeKey(key);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function jitter(mean: number, rng: () => number): number {
  const min = Math.max(50, Math.round(mean * 0.5));
  const max = Math.round(mean * 1.5);
  return Math.round(min + rng() * (max - min));
}

function randomInt(min: number, max: number, rng: () => number): number {
  const lo = Math.floor(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}



function collectMainTrialRecords(rows: Array<Record<string, unknown>>, participantId: string): TrialRecord[] {
  const output: TrialRecord[] = [];
  for (const row of rows) {
    if (row.phase !== "main_response_window") continue;

    const channel1 = Number(row.channel1);
    const channel2 = Number(row.channel2);
    const trialIndex = Number(row.trialIndex);
    const rt = Number(row.rt);
    const correct = Number(row.correct);

    output.push({
      participantId: asString(row.participantId) || participantId,
      blockId: asString(row.blockId) || "",
      blockLabel: asString(row.blockLabel) || "",
      blockRule: asString(row.blockRule) || "",
      trialId: asString(row.trialId) || "",
      trialIndex: Number.isFinite(trialIndex) ? trialIndex : -1,
      rule: asString(row.rule) || "",
      layout: asString(row.layout) || "",
      stimCode: asString(row.stimCode) || "",
      channel1: Number.isFinite(channel1) ? channel1 : 0,
      channel2: Number.isFinite(channel2) ? channel2 : 0,
      stimCategory: asString(row.stimCategory) || "",
      expectedCategory: asString(row.expectedCategory) || "",
      responseCategory: asString(row.responseCategory) || "timeout",
      responseKey: asString(row.responseKey) || "",
      rt: Number.isFinite(rt) ? rt : -1,
      correct: correct === 1 ? 1 : 0,
    });
  }
  return output;
}

function clampUnitRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
