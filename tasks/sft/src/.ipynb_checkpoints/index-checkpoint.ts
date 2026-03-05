import {
  QuestBinaryStaircase,
  buildLinearRange,
  buildScheduledItems,
  createMulberry32,
  createEventLogger,
  dbToLuminance,
  deepMerge,
  escapeHtml,
  finalizeTaskRun,
  hashSeed,
  normalizeKey,
  renderFixedTrialFrame,
  runWithRunner,
  type JSONObject,
  type TaskAdapter,
  type TaskAdapterContext,
} from "@experiments/core";
import { initJsPsych } from "jspsych";
import HtmlKeyboardResponsePlugin from "@jspsych/plugin-html-keyboard-response";
import CallFunctionPlugin from "@jspsych/plugin-call-function";
import defaultConfig from "./configs/default.json";
import staircaseExampleConfig from "./configs/staircase_example.json";

const variantConfigMap: Record<string, unknown> = {
  default: defaultConfig,
  staircase_example: staircaseExampleConfig,
};

const adapter: TaskAdapter = {
  manifest: {
    taskId: "sft",
    label: "SFT (DotsExp)",
    variants: [
      { id: "default", label: "Default", configPath: "sft/default" },
      { id: "staircase_example", label: "Staircase Example", configPath: "sft/staircase_example" },
    ],
  },
  async launch(context) {
    const selected = (variantConfigMap[context.selection.variantId] ?? defaultConfig) as JSONObject;
    const config = deepMerge(deepMerge({}, selected), context.taskConfig ?? {});
    await runWithRunner({
      context: {
        ...context,
        taskConfig: config,
      },
      preferredRunner: "jspsych",
      defaultRunner: "jspsych",
      runners: {
        jspsych: runSftTask,
      },
    });
  },
};

export const sftAdapter = adapter;
export const sftDefaultConfig = defaultConfig;
export const sftVariantConfigs = variantConfigMap;

interface SftParsedConfig {
  title: string;
  instructions: string;
  timing: {
    fixationMs: number;
    blankMs: number;
    stimulusMs: number;
    responseDeadlineMs: number;
  };
  display: {
    aperturePx: number;
    dotOffsetPx: number;
    dotRadiusPx: number;
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
  salience: {
    high: number;
    low: number;
  };
  conditionCodes: string[];
  manipulations: Manipulation[];
  blocks: RawBlock[];
  staircase?: StaircaseSpec | null;
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
}

interface PlannedBlock {
  id: string;
  label: string;
  rule: string;
  trials: PlannedTrial[];
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
  stimCategory: string;
  correctResponse: string;
  responseCategory: string;
  responseKey: string;
  rtMs: number;
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
  rtMs: number;
}

interface BlockRunningStats {
  correct: number;
  total: number;
  accuracy: number;
}

async function runSftTask(context: TaskAdapterContext): Promise<void> {
  const parsed = parseSftConfig(context.taskConfig);
  const rng = createMulberry32(hashSeed(context.selection.participant.participantId, context.selection.participant.sessionId, "sft"));
  const root = context.container;

  root.style.maxWidth = "980px";
  root.style.margin = "1rem auto";
  root.style.fontFamily = "system-ui";

  const records: TrialRecord[] = [];
  const staircaseRecords: StaircaseRecord[] = [];
  const eventLogger = createEventLogger(context.selection);
  const allowedKeys = allKeys(parsed.responses);

  eventLogger.emit("task_start", { task: "sft", runner: "jspsych" });

  const timeline: any[] = [];
  pushContinueScreen(
    timeline,
    `<h2>${escapeHtml(parsed.title)}</h2><p>Participant: <code>${escapeHtml(context.selection.participant.participantId)}</code></p><p>Press SPACE to begin.</p>`,
    "intro_start",
  );
  pushContinueScreen(
    timeline,
    `<p>${escapeHtml(parsed.instructions)}</p>${renderKeySummary(parsed.responses)}<p>Press SPACE to continue.</p>`,
    "intro_instructions",
  );

  applyGlobalSalience(parsed, parsed.salience);

  if (parsed.staircase?.enabled) {
    appendStaircaseTimeline({
      timeline,
      config: parsed,
      rng,
      allowedKeys,
      staircaseRecords,
      eventLogger,
    });
  }

  const plan = buildBlockPlan(parsed, rng);
  appendBlockTimeline({
    timeline,
    blocks: plan,
    config: parsed,
    rng,
    allowedKeys,
    records,
    participantId: context.selection.participant.participantId,
    eventLogger,
  });

  const jsPsych = initJsPsych({
    display_element: root,
  });
  await jsPsych.run(timeline);

  eventLogger.emit("task_complete", { task: "sft", runner: "jspsych", nTrials: records.length });
  const payload = { selection: context.selection, records, staircaseRecords, events: eventLogger.events };
  await finalizeTaskRun({
    coreConfig: context.coreConfig,
    selection: context.selection,
    payload,
    csv: { contents: recordsToCsv(records), suffix: "sft" },
    completionStatus: "complete",
  });

  root.innerHTML = "<h2>SFT complete</h2><p>Data saved locally.</p>";
}

function appendStaircaseTimeline(args: {
  timeline: any[];
  config: SftParsedConfig;
  rng: () => number;
  allowedKeys: string[];
  staircaseRecords: StaircaseRecord[];
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, config, rng, allowedKeys, staircaseRecords, eventLogger } = args;
  const staircase = config.staircase;
  if (!staircase?.enabled) return;

  pushContinueScreen(
    timeline,
    "<h3>Adaptive Calibration</h3><p>A short staircase will estimate threshold and update salience levels.</p><p>Press SPACE to start.</p>",
    "staircase_start",
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
      onResponse: (response) => {
        if (!activeTrial) return;
        const responseCategory = classifyResponse("OR", response.key, config.responses);
        const responseIndex: 0 | 1 = responseCategory === "yes" ? 0 : 1;
        quest.update(responseIndex);
        staircaseRecords.push({
          trialIndex: activeTrial.trialIndex,
          stimDb: activeTrial.stimDb,
          stimLuminance: dbToLuminance(activeTrial.stimDb),
          responseKey: response.key ?? "",
          responseCategory,
          responseIndex,
          rtMs: response.rtMs ?? -1,
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
    type: HtmlKeyboardResponsePlugin,
    choices: [" "],
    stimulus: () => {
      return `<h3>Calibration Complete</h3><p>Threshold luminance estimate: <b>${thresholdLuminanceEstimate.toFixed(4)}</b></p><p>New levels: low=<b>${updatedSalience.low.toFixed(4)}</b>, high=<b>${updatedSalience.high.toFixed(4)}</b></p><p>Press SPACE to continue.</p>`;
    },
    data: { phase: "staircase_end" },
  });
}

function appendBlockTimeline(args: {
  timeline: any[];
  blocks: PlannedBlock[];
  config: SftParsedConfig;
  rng: () => number;
  allowedKeys: string[];
  records: TrialRecord[];
  participantId: string;
  eventLogger: ReturnType<typeof createEventLogger>;
}): void {
  const { timeline, blocks, config, rng, allowedKeys, records, participantId, eventLogger } = args;
  const blockStatsMap = new Map<string, BlockRunningStats>();

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    blockStatsMap.set(block.id, { correct: 0, total: 0, accuracy: 0 });

    timeline.push({
      type: CallFunctionPlugin,
      data: { phase: "block_start_hook", blockId: block.id, blockIndex },
      func: () => {
        eventLogger.emit("block_start", { blockId: block.id, label: block.label }, { blockIndex });
      },
    });

    pushContinueScreen(
      timeline,
      `<h3>${escapeHtml(block.label)}</h3><p>Rule: <b>${escapeHtml(block.rule)}</b></p><p>Trials: ${block.trials.length}</p><p>Press SPACE to start block.</p>`,
      "block_start",
      block.id,
    );

    for (let trialIndex = 0; trialIndex < block.trials.length; trialIndex += 1) {
      const trial = block.trials[trialIndex];

      appendDotTrialTimeline({
        timeline,
        config,
        trialProvider: () => trial,
        allowedKeys,
        rng,
        phasePrefix: "main",
        dataContext: {
          blockId: block.id,
          blockIndex,
          trialId: trial.id,
          trialIndex,
          rule: trial.rule,
          stimCode: trial.stimCode,
        },
        onResponse: (response) => {
          const responseCategory = classifyResponse(trial.rule, response.key, config.responses);
          const correctResponse = computeCorrectResponse(trial.rule, trial.stimCategory);
          const correct = Number(responseCategory === correctResponse);

          records.push({
            participantId,
            blockId: block.id,
            blockLabel: block.label,
            blockRule: block.rule,
            trialId: trial.id,
            trialIndex: trial.trialIndex,
            rule: trial.rule,
            layout: trial.layout,
            stimCode: trial.stimCode,
            stimCategory: trial.stimCategory,
            correctResponse,
            responseCategory,
            responseKey: response.key ?? "",
            rtMs: response.rtMs ?? -1,
            correct,
          });

          const stats = blockStatsMap.get(block.id);
          if (stats) {
            stats.correct += correct;
            stats.total += 1;
            stats.accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
          }

          eventLogger.emit(
            "trial_complete",
            {
              blockId: block.id,
              rule: trial.rule,
              trialType: "sft",
              correct,
              responseKey: response.key ?? "",
              rtMs: response.rtMs ?? -1,
            },
            { blockIndex, trialIndex },
          );
        },
      });
    }

    timeline.push({
      type: CallFunctionPlugin,
      data: { phase: "block_end_hook", blockId: block.id, blockIndex },
      func: () => {
        const stats = blockStatsMap.get(block.id);
        eventLogger.emit("block_end", { blockId: block.id, accuracy: stats?.accuracy ?? 0 }, { blockIndex });
      },
    });

    timeline.push({
      type: HtmlKeyboardResponsePlugin,
      choices: [" "],
      stimulus: () => {
        const stats = blockStatsMap.get(block.id);
        const accuracy = stats?.accuracy ?? 0;
        return `<h3>End of ${escapeHtml(block.label)}</h3><p>Accuracy: <b>${accuracy.toFixed(1)}%</b></p><p>Press SPACE to continue.</p>`;
      },
      data: { phase: "block_end", blockId: block.id, blockIndex },
    });
  }
}

function appendDotTrialTimeline(args: {
  timeline: any[];
  config: SftParsedConfig;
  trialProvider: () => PlannedTrial | null;
  allowedKeys: string[];
  rng: () => number;
  phasePrefix: "staircase" | "main";
  onResponse: (response: TrialResponse) => void;
  dataContext?: Record<string, unknown>;
}): void {
  const { timeline, config, trialProvider, allowedKeys, rng, phasePrefix, onResponse, dataContext } = args;
  const fixationMs = jitter(config.timing.fixationMs, rng);
  const blankMs = Math.max(0, config.timing.blankMs);
  const responseDeadlineMs = Math.max(0, config.timing.responseDeadlineMs);
  const postStimulusMs = Math.max(0, config.timing.stimulusMs);

  const baseData = dataContext ?? {};

  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: () => {
      const trial = trialProvider();
      return trial ? renderFixation(config, trial) : renderBlank(config, null);
    },
    choices: "NO_KEYS",
    response_ends_trial: false,
    trial_duration: fixationMs,
    data: { ...baseData, phase: `${phasePrefix}_fixation` },
  });

  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: () => {
      const trial = trialProvider();
      return renderBlank(config, trial);
    },
    choices: "NO_KEYS",
    response_ends_trial: false,
    trial_duration: blankMs,
    data: { ...baseData, phase: `${phasePrefix}_blank` },
  });

  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: () => {
      const trial = trialProvider();
      return trial ? renderStimulus(config, trial) : renderBlank(config, null);
    },
    choices: allowedKeys,
    response_ends_trial: false,
    trial_duration: responseDeadlineMs,
    data: { ...baseData, phase: `${phasePrefix}_response_window` },
    on_finish: (data: Record<string, unknown>) => {
      onResponse(extractTrialResponse(data));
    },
  });

  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: () => {
      const trial = trialProvider();
      return trial ? renderStimulus(config, trial) : renderBlank(config, null);
    },
    choices: "NO_KEYS",
    response_ends_trial: false,
    trial_duration: postStimulusMs,
    data: { ...baseData, phase: `${phasePrefix}_post_stimulus` },
  });
}

function extractTrialResponse(data: Record<string, unknown>): TrialResponse {
  const rawKey = data.response;
  const rawRt = data.rt;

  const key = typeof rawKey === "string" ? normalizeKey(rawKey) : null;
  const rtMs = typeof rawRt === "number" && Number.isFinite(rawRt) ? rawRt : null;
  return { key, rtMs };
}

function pushContinueScreen(timeline: any[], html: string, phase: string, blockId?: string): void {
  timeline.push({
    type: HtmlKeyboardResponsePlugin,
    stimulus: html,
    choices: [" "],
    data: {
      phase,
      ...(blockId ? { blockId } : {}),
    },
  });
}

function applyGlobalSalience(config: SftParsedConfig, salience: { low: number; high: number }): void {
  config.salience = { ...salience };
  for (const manipulation of config.manipulations) {
    for (const variant of manipulation.variants) {
      variant.salience = { ...salience };
    }
  }
}

function parseSftConfig(config: JSONObject): SftParsedConfig {
  const design = asObject(config.design);
  const manipRaw = asArray(design?.manipulations);
  const blockRaw = asArray(design?.blocks);
  if (manipRaw.length === 0) throw new Error("SFT config invalid: design.manipulations is empty.");
  if (blockRaw.length === 0) throw new Error("SFT config invalid: design.blocks is empty.");

  const responsesRaw = asObject(config.responses);
  const keysRaw = asObject(responsesRaw?.keys);
  const idRaw = asObject(keysRaw?.ID);

  const manipulations = manipRaw.map((raw, idx) => parseManipulation(raw, idx, config));
  const known = new Set(manipulations.map((m) => m.id));
  const blocks = blockRaw.map((raw, idx) => {
    const b = asObject(raw);
    if (!b) throw new Error(`Invalid SFT block ${idx + 1}`);
    const id = asString(b.id) || asString(b.block_id) || `BLOCK_${idx + 1}`;
    const label = asString(b.label) || id;
    const nTrials = toPositiveNumber(b.nTrials ?? b.n_trials, 36);
    const manipulationId = asString(b.manipulation) || manipulations[0].id;
    if (!known.has(manipulationId)) throw new Error(`Unknown manipulation '${manipulationId}' in block '${id}'.`);
    return { id, label, nTrials, manipulationId };
  });

  const stimulusRaw = asObject(config.stimulus);
  const salienceRaw = asObject(stimulusRaw?.salience_levels);
  const conditionCodes = asArray(stimulusRaw?.condition_codes).map((v) => asString(v)).filter((v): v is string => Boolean(v));
  return {
    title: asString(asObject(config.task)?.title) || "SFT Task",
    instructions:
      asString(asObject(config.task)?.instructions) ||
      "Respond according to the block rule. OR/AND/XOR use yes/no keys; ID uses four category keys.",
    timing: {
      fixationMs: toNonNegativeNumber(asObject(config.timing)?.fixation_truncexp ? (asObject(asObject(config.timing)?.fixation_truncexp)?.mean ?? 500) : 500, 500),
      blankMs: toNonNegativeNumber(asObject(config.timing)?.blank_ms, 66),
      stimulusMs: toPositiveNumber(asObject(config.timing)?.stimulus_ms, 100),
      responseDeadlineMs: toPositiveNumber(asObject(config.timing)?.response_deadline_ms, 3000),
    },
    display: {
      aperturePx: toPositiveNumber(asObject(config.display)?.aperture_px, 250),
      dotOffsetPx: toPositiveNumber(asObject(config.display)?.dot_offset_px, 44),
      dotRadiusPx: toPositiveNumber(asObject(config.display)?.dot_radius_px, 7),
    },
    responses: {
      orYes: readKeyArray(asObject(keysRaw?.OR)?.yes, ["a"]),
      orNo: readKeyArray(asObject(keysRaw?.OR)?.no, ["l"]),
      andYes: readKeyArray(asObject(keysRaw?.AND)?.yes, ["a"]),
      andNo: readKeyArray(asObject(keysRaw?.AND)?.no, ["l"]),
      xorYes: readKeyArray(asObject(keysRaw?.XOR)?.yes, ["a"]),
      xorNo: readKeyArray(asObject(keysRaw?.XOR)?.no, ["l"]),
      idAB: readKeyArray(idRaw?.AB, ["q"]),
      idAN: readKeyArray(idRaw?.AN, ["w"]),
      idNB: readKeyArray(idRaw?.NB, ["o"]),
      idNN: readKeyArray(idRaw?.NN, ["p"]),
    },
    salience: {
      high: toUnitNumber(salienceRaw?.high, 0.7),
      low: toUnitNumber(salienceRaw?.low, 0.2),
    },
    conditionCodes: conditionCodes.length > 0 ? conditionCodes : ["HH", "HL", "LH", "LL", "Hx", "Lx", "xH", "xL", "xx"],
    manipulations,
    blocks,
    staircase: parseStaircase(config),
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
  const trialPlan = asObject(m.trial_plan);
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

    const uniqueVariants = Array.from(new Set(variantSchedule));
    const plannedStimuli = new Map<Variant, string[]>();
    const plannedStimulusIndex = new Map<Variant, number>();
    for (const variant of uniqueVariants) {
      const pool = variant.trialPool.length > 0 ? variant.trialPool : config.conditionCodes;
      const countForVariant = variantSchedule.filter((entry) => entry === variant).length;
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

    const rules = Array.from(new Set(trials.map((t) => t.rule)));
    return {
      id: block.id,
      label: block.label,
      rule: rules.length === 1 ? rules[0] : "MIXED",
      trials,
    };
  });
}

function renderStimulus(config: SftParsedConfig, trial: PlannedTrial): string {
  const aperture = config.display.aperturePx;
  const center = aperture / 2;
  const positions = dotPositions(center, center, trial.layout, config.display.dotOffsetPx);
  const dots = dotsFromStimCode(trial.stimCode, trial.salience);
  const dotEls = dots.map((dot) => {
    const p = positions[dot.loc];
    const color = luminanceToGray(dot.luminance);
    const size = config.display.dotRadiusPx * 2;
    return `<div style="position:absolute;left:${Math.round(p.x - config.display.dotRadiusPx)}px;top:${Math.round(p.y - config.display.dotRadiusPx)}px;width:${size}px;height:${size}px;border-radius:50%;background:${color};"></div>`;
  });
  return renderTrialFrame(config, dotEls.join(""), trial);
}

function renderFixation(config: SftParsedConfig, trial: PlannedTrial): string {
  const cross = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;line-height:1;">+</div>';
  return renderTrialFrame(config, cross, trial);
}

function renderBlank(config: SftParsedConfig, trial: PlannedTrial | null): string {
  return renderTrialFrame(config, "", trial);
}

function renderTrialFrame(config: SftParsedConfig, innerHtml: string, trial: PlannedTrial | null): string {
  const cueText = trial?.showRuleCue ? `Rule: ${escapeHtml(trial.ruleCueLabel || trial.rule)}` : "&nbsp;";
  const cueHtml = `<span style="color:#0f172a;font-size:16px;">${cueText}</span>`;
  return renderFixedTrialFrame({
    aperturePx: config.display.aperturePx,
    cueHtml,
    innerHtml,
    paddingYPx: 16,
    cueHeightPx: 24,
    cueMarginBottomPx: 6,
    canvasBackground: "#000",
    canvasBorder: "2px solid #444",
  });
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

function classifyResponse(rule: PlannedTrial["rule"], key: string | null, responses: SftParsedConfig["responses"]): string {
  if (!key) return "timeout";
  if (rule === "OR") return responses.orYes.includes(key) ? "yes" : responses.orNo.includes(key) ? "no" : "invalid";
  if (rule === "AND") return responses.andYes.includes(key) ? "yes" : responses.andNo.includes(key) ? "no" : "invalid";
  if (rule === "XOR") return responses.xorYes.includes(key) ? "yes" : responses.xorNo.includes(key) ? "no" : "invalid";
  if (responses.idAB.includes(key)) return "AB";
  if (responses.idAN.includes(key)) return "AN";
  if (responses.idNB.includes(key)) return "NB";
  if (responses.idNN.includes(key)) return "NN";
  return "invalid";
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

function dotPositions(centerX: number, centerY: number, mode: "ud" | "lr" | "center", offsetPx: number): Record<"A" | "B", { x: number; y: number }> {
  if (mode === "lr") return { A: { x: centerX - offsetPx, y: centerY }, B: { x: centerX + offsetPx, y: centerY } };
  if (mode === "center") return { A: { x: centerX, y: centerY }, B: { x: centerX, y: centerY } };
  return { A: { x: centerX, y: centerY - offsetPx }, B: { x: centerX, y: centerY + offsetPx } };
}

function luminanceToGray(level: number): string {
  const v = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(1, level)) * 255)));
  return `rgb(${v},${v},${v})`;
}

function allKeys(responses: SftParsedConfig["responses"]): string[] {
  return [
    ...responses.orYes,
    ...responses.orNo,
    ...responses.andYes,
    ...responses.andNo,
    ...responses.xorYes,
    ...responses.xorNo,
    ...responses.idAB,
    ...responses.idAN,
    ...responses.idNB,
    ...responses.idNN,
  ].map(normalizeKey);
}

function jitter(mean: number, rng: () => number): number {
  const min = Math.max(50, Math.round(mean * 0.5));
  const max = Math.round(mean * 1.5);
  return Math.round(min + rng() * (max - min));
}

function readKeyArray(value: unknown, fallback: string[]): string[] {
  const keys = asArray(value).map((v) => asString(v)).filter((v): v is string => Boolean(v)).map(normalizeKey);
  return keys.length > 0 ? keys : fallback.map(normalizeKey);
}

function recordsToCsv(records: TrialRecord[]): string {
  if (records.length === 0) return "";
  const columns = Object.keys(records[0]) as Array<keyof TrialRecord>;
  const header = columns.join(",");
  const rows = records.map((record) => columns.map((column) => csvCell(record[column])).join(","));
  return [header, ...rows].join("\n");
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) return `"${raw.replaceAll("\"", "\"\"")}"`;
  return raw;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function toUnitNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNumberArray(value: unknown, fallback: number[]): number[] {
  const out = asArray(value).map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry));
  return out.length > 0 ? out : fallback;
}

function clampUnitRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
