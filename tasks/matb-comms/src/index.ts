/**
 * MATB Communications Task (standalone adapter).
 *
 * Runs the comms sub-task as an independent experiment with block/trial
 * structure. Each "trial" is a timed epoch during which prompt events
 * are injected according to a schedule defined in the config.
 *
 * The core state machine and rendering live in @experiments/task-matb;
 * this adapter wraps them in the standard TaskOrchestrator flow.
 */

import {
  asArray,
  asObject,
  asString,
  createTaskAdapter,
  buildTaskInstructionConfig,
  applyTaskInstructionConfig,
  toPositiveNumber,
  toNonNegativeNumber,
  toPositiveFloat,
  toStringScreens,
  resolveBlockScreenSlotValue,
  TaskOrchestrator,
  runTrialWithEnvelope,
  sleep,
  type TaskAdapterContext,
  type SelectionContext,
  type StandardTaskInstructionConfig,
} from "@experiments/core";
import {
  createCommsSubTaskHandle,
  type CommsPromptRecord,
} from "@experiments/task-matb";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const matbCommsAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-comms",
    label: "MATB Communications",
  },
  run: (context) => runMatbCommsTask(context),
  terminate: async () => {},
});

// ---------------------------------------------------------------------------
// Parsed config types
// ---------------------------------------------------------------------------

interface PromptEvent {
  /** Time offset within the trial (ms). */
  timeMs: number;
  /** Callsign spoken in the prompt (may or may not be ownCallsign). */
  callsign: string;
  /** Target radio id (e.g. "com1"). */
  radio: string;
  /** Target frequency in MHz. */
  frequency: number;
}

interface ParsedBlock {
  label: string;
  phase: string;
  trials: number;
  trialDurationMs: number;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  promptSchedule: PromptEvent[];
  /** Comms sub-task config overrides for this block. */
  commsConfig: Record<string, unknown>;
}

interface ParsedConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  interTrialIntervalMs: number;
  blocks: ParsedBlock[];
  commsConfig: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trial record
// ---------------------------------------------------------------------------

interface CommsTrialRecord {
  participantId: string;
  configPath: string;
  blockIndex: number;
  blockLabel: string;
  trialIndex: number;
  phase: string;
  durationMs: number;
  hitCount: number;
  missCount: number;
  faCount: number;
  crCount: number;
}

// ---------------------------------------------------------------------------
// Task runner
// ---------------------------------------------------------------------------

async function runMatbCommsTask(context: TaskAdapterContext): Promise<unknown> {
  const parsed = parseConfig(context.taskConfig, context.selection);
  const participantId = context.selection.participant.participantId;
  const configPath = context.selection.configPath ?? "";
  const eventLogger = context.eventLogger;

  const root = context.container;
  root.style.fontFamily = "system-ui";

  const stageShell = document.createElement("div");
  stageShell.style.display = "flex";
  stageShell.style.justifyContent = "center";
  stageShell.style.alignItems = "center";
  stageShell.style.width = "320px";
  stageShell.style.height = "420px";
  root.innerHTML = "";
  root.appendChild(stageShell);

  const trialRecords: CommsTrialRecord[] = [];
  const allPromptRecords: CommsPromptRecord[] = [];

  const orchestrator = new TaskOrchestrator<ParsedBlock, number, CommsTrialRuntimeResult>(context);
  applyTaskInstructionConfig(context.taskConfig, parsed.instructions);

  return await orchestrator.run({
    buttonIdPrefix: "matb-comms-continue",
    getBlocks: () =>
      parsed.blocks.map((block) => ({
        ...block,
        modules: {},
      })),
    getTrials: ({ block }) => Array.from({ length: block.trials }, (_, i) => i),
    runTrial: async ({ block, blockIndex, trial, trialIndex }) =>
      runTrialWithEnvelope<
        { block: ParsedBlock; blockIndex: number; trial: number; trialIndex: number },
        CommsTrialRuntimeResult
      >({
        context: { block, blockIndex, trial, trialIndex },
        before: ({ block, blockIndex, trialIndex }) => {
          eventLogger.emit(
            "trial_start",
            { label: block.label, phase: block.phase, mode: "comms" },
            { blockIndex, trialIndex },
          );
        },
        execute: ({ block }) =>
          runCommsTrial(stageShell, block),
        after: async ({ block, blockIndex, trialIndex }, result) => {
          trialRecords.push({
            participantId,
            configPath,
            blockIndex,
            blockLabel: block.label,
            trialIndex,
            phase: block.phase,
            durationMs: result.elapsedMs,
            hitCount:  result.hitCount,
            missCount: result.missCount,
            faCount:   result.faCount,
            crCount:   result.crCount,
          });
          allPromptRecords.push(...result.records);

          eventLogger.emit(
            "trial_end",
            {
              durationMs: result.elapsedMs,
              mode: "comms",
              hitCount:  result.hitCount,
              missCount: result.missCount,
              faCount:   result.faCount,
              crCount:   result.crCount,
            },
            { blockIndex, trialIndex },
          );

          if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
            await sleep(parsed.interTrialIntervalMs);
          }
        },
      }),
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "matb-comms", runner: "native_comms" });
    },
    onBlockStart: async ({ block, blockIndex }) => {
      root.innerHTML = "";
      root.appendChild(stageShell);
      eventLogger.emit(
        "block_start",
        { label: block.label, phase: block.phase, trials: block.trials },
        { blockIndex },
      );
    },
    onBlockEnd: async ({ block, blockIndex }) => {
      eventLogger.emit("block_end", { label: block.label, phase: block.phase }, { blockIndex });
      root.innerHTML = "";
      root.appendChild(stageShell);
    },
    onTaskEnd: () => {
      eventLogger.emit("task_complete", { task: "matb-comms", nTrials: trialRecords.length });
    },
    csvOptions: {
      suffix: "matb_comms_trials",
      getRecords: () => trialRecords,
    },
    getTaskMetadata: () => ({
      config: parsed,
      records: trialRecords,
      promptRecords: allPromptRecords,
      eventLog: eventLogger.events,
    }),
  });
}

// ---------------------------------------------------------------------------
// Trial runner using the SubTaskHandle
// ---------------------------------------------------------------------------

interface CommsTrialRuntimeResult {
  elapsedMs: number;
  records: CommsPromptRecord[];
  hitCount: number;
  missCount: number;
  faCount: number;
  crCount: number;
}

async function runCommsTrial(
  stageHost: HTMLElement,
  block: ParsedBlock,
): Promise<CommsTrialRuntimeResult> {
  stageHost.innerHTML = "";

  const handle = createCommsSubTaskHandle();
  handle.start(stageHost, block.commsConfig);

  // Sort prompt schedule.
  const schedule = [...block.promptSchedule].sort((a, b) => a.timeMs - b.timeMs);
  let scheduleIndex = 0;

  // Install keyboard listener.
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (handle.handleKeyDown?.(key, performance.now())) {
      event.preventDefault();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  const startMs = performance.now();
  let previousMs = startMs;

  await new Promise<void>((resolve) => {
    let rafId: number | null = null;

    const tick = (now: number) => {
      const elapsed = now - startMs;
      const dt = now - previousMs;
      previousMs = now;

      // Inject due prompt events.
      while (scheduleIndex < schedule.length && schedule[scheduleIndex].timeMs <= elapsed) {
        const pe = schedule[scheduleIndex];
        handle.handleScenarioEvent?.({
          timeMs: pe.timeMs,
          targetId: "comms",
          command: "prompt",
          value: { callsign: pe.callsign, radio: pe.radio, frequency: pe.frequency },
        });
        scheduleIndex += 1;
      }

      handle.step(now, dt);

      if (elapsed >= block.trialDurationMs) {
        if (rafId != null) cancelAnimationFrame(rafId);
        resolve();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  });

  window.removeEventListener("keydown", onKeyDown);

  const result = handle.stop();
  return result;
}

// ---------------------------------------------------------------------------
// Config parsing
// ---------------------------------------------------------------------------

function parseConfig(taskConfig: Record<string, unknown>, _selection: SelectionContext): ParsedConfig {
  const taskRaw = asObject(taskConfig.task) ?? {};
  const title = asString(taskRaw.title) ?? "MATB Communications";

  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructionConfig = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "Listen carefully to the audio prompts.",
        "Each prompt announces a callsign, a radio (NAV1, NAV2, COM1, or COM2), and a frequency.",
        "If the callsign is yours, use the arrow keys to select the correct radio and tune it to the announced frequency, then press Enter to confirm.",
        "If it is someone else's callsign, do not respond.",
        "↑↓ to select a radio  |  ←→ to tune frequency  |  Enter to confirm",
      ],
    },
    blockIntroTemplateDefault: "Block with {nTrials} communications trial(s). Phase: {phase}.",
  });

  const commsConfigRaw = asObject(taskConfig.comms) ?? {};

  const planRaw = asObject(taskConfig.plan) ?? {};
  const blocksRaw = asArray(planRaw.blocks);
  const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};

  const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
    const raw = asObject(entry) ?? {};

    const scheduleRaw = asArray(raw.promptSchedule ?? trialDefaultsRaw.promptSchedule);
    const promptSchedule: PromptEvent[] = [];
    for (const pe of scheduleRaw) {
      const o = asObject(pe);
      if (!o) continue;
      const callsign = asString(o.callsign);
      const radio    = asString(o.radio);
      if (!callsign || !radio) continue;
      promptSchedule.push({
        timeMs:    toNonNegativeNumber(o.timeMs, 0),
        callsign,
        radio,
        frequency: toPositiveFloat(o.frequency, 118.0),
      });
    }

    const blockCommsRaw = asObject(raw.comms) ?? {};
    const mergedCommsConfig: Record<string, unknown> = { ...commsConfigRaw, ...blockCommsRaw };

    return {
      label:               asString(raw.label) ?? `Block ${index + 1}`,
      phase:               asString(raw.phase) ?? "main",
      trials:              toPositiveNumber(raw.trials, 1),
      trialDurationMs:     toPositiveNumber(raw.trialDurationMs ?? trialDefaultsRaw.durationMs, 120000),
      beforeBlockScreens:  toStringScreens(resolveBlockScreenSlotValue(raw, "before")),
      afterBlockScreens:   toStringScreens(resolveBlockScreenSlotValue(raw, "after")),
      promptSchedule,
      commsConfig:         mergedCommsConfig,
    } satisfies ParsedBlock;
  });

  return {
    title,
    instructions: instructionConfig,
    interTrialIntervalMs: toNonNegativeNumber(taskConfig.interTrialIntervalMs, 500),
    blocks,
    commsConfig: commsConfigRaw,
  };
}
