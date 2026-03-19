/**
 * MATB Resource Management Task (standalone adapter).
 *
 * Runs the resman sub-task as an independent experiment with block/trial
 * structure. Each "trial" is a timed epoch during which pump failures
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
  createResmanSubTaskHandle,
  type ResmanSubTaskResult,
  type ResmanTankRecord,
} from "@experiments/task-matb";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const matbResmanAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-resman",
    label: "MATB Resource Management",
    variants: [
      { id: "default", label: "MATB Resman Default", configPath: "matb-resman/default" },
    ],
  },
  run: (context) => runMatbResmanTask(context),
  terminate: async () => {},
});

// ---------------------------------------------------------------------------
// Parsed config types
// ---------------------------------------------------------------------------

interface PumpFailureEvent {
  /** Time offset within the trial (ms). */
  timeMs: number;
  /** Pump ID to fail (e.g., "3"). */
  pumpId: string;
  /** State to set: "failure" or "off" (to restore). */
  state: "failure" | "off" | "on";
}

interface ParsedBlock {
  label: string;
  phase: string;
  trials: number;
  trialDurationMs: number;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  /** Pump failure events injected during each trial. */
  failureSchedule: PumpFailureEvent[];
  /** Resman sub-task config overrides for this block. */
  resmanConfig: Record<string, unknown>;
}

interface ParsedConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  interTrialIntervalMs: number;
  blocks: ParsedBlock[];
  resmanConfig: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trial record
// ---------------------------------------------------------------------------

interface ResmanTrialRecord {
  participantId: string;
  variantId: string;
  blockIndex: number;
  blockLabel: string;
  trialIndex: number;
  phase: string;
  durationMs: number;
  pumpToggles: number;
  tankA_meanDeviation: number | null;
  tankA_propInTolerance: number | null;
  tankB_meanDeviation: number | null;
  tankB_propInTolerance: number | null;
}

// ---------------------------------------------------------------------------
// Task runner
// ---------------------------------------------------------------------------

async function runMatbResmanTask(context: TaskAdapterContext): Promise<unknown> {
  const parsed = parseConfig(context.taskConfig, context.selection);
  const participantId = context.selection.participant.participantId;
  const variantId = context.selection.variantId;
  const eventLogger = context.eventLogger;

  const root = context.container;
  root.style.fontFamily = "system-ui";

  const stageShell = document.createElement("div");
  stageShell.style.display = "flex";
  stageShell.style.justifyContent = "center";
  stageShell.style.alignItems = "center";
  stageShell.style.width = "360px";
  stageShell.style.height = "420px";
  root.innerHTML = "";
  root.appendChild(stageShell);

  const trialRecords: ResmanTrialRecord[] = [];
  const allTankRecords: ResmanTankRecord[][] = [];

  const orchestrator = new TaskOrchestrator<ParsedBlock, number, ResmanTrialRuntimeResult>(context);
  applyTaskInstructionConfig(context.taskConfig, parsed.instructions);

  return await orchestrator.run({
    buttonIdPrefix: "matb-resman-continue",
    getBlocks: () =>
      parsed.blocks.map((block) => ({
        ...block,
        modules: {},
      })),
    getTrials: ({ block }) => Array.from({ length: block.trials }, (_, i) => i),
    runTrial: async ({ block, blockIndex, trial, trialIndex }) =>
      runTrialWithEnvelope<
        { block: ParsedBlock; blockIndex: number; trial: number; trialIndex: number },
        ResmanTrialRuntimeResult
      >({
        context: { block, blockIndex, trial, trialIndex },
        before: ({ block, blockIndex, trialIndex }) => {
          eventLogger.emit(
            "trial_start",
            { label: block.label, phase: block.phase, mode: "resman" },
            { blockIndex, trialIndex },
          );
        },
        execute: ({ block }) =>
          runResmanTrial(stageShell, block),
        after: async ({ block, blockIndex, trialIndex }, result) => {
          const tankA = result.tankRecords.find((t) => t.tankId === "a");
          const tankB = result.tankRecords.find((t) => t.tankId === "b");

          trialRecords.push({
            participantId,
            variantId,
            blockIndex,
            blockLabel: block.label,
            trialIndex,
            phase: block.phase,
            durationMs: result.elapsedMs,
            pumpToggles: result.pumpToggles,
            tankA_meanDeviation: tankA?.meanDeviation ?? null,
            tankA_propInTolerance: tankA?.proportionInTolerance ?? null,
            tankB_meanDeviation: tankB?.meanDeviation ?? null,
            tankB_propInTolerance: tankB?.proportionInTolerance ?? null,
          });
          allTankRecords.push(result.tankRecords);

          eventLogger.emit(
            "trial_end",
            {
              durationMs: result.elapsedMs,
              mode: "resman",
              pumpToggles: result.pumpToggles,
            },
            { blockIndex, trialIndex },
          );

          if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
            await sleep(parsed.interTrialIntervalMs);
          }
        },
      }),
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "matb-resman", runner: "native_resman" });
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
      eventLogger.emit("task_complete", { task: "matb-resman", nTrials: trialRecords.length });
    },
    csvOptions: {
      suffix: "matb_resman_trials",
      getRecords: () => trialRecords,
    },
    getTaskMetadata: () => ({
      config: parsed,
      records: trialRecords,
      tankRecords: allTankRecords,
      eventLog: eventLogger.events,
    }),
  });
}

// ---------------------------------------------------------------------------
// Trial runner using the SubTaskHandle
// ---------------------------------------------------------------------------

interface ResmanTrialRuntimeResult {
  elapsedMs: number;
  tankRecords: ResmanTankRecord[];
  pumpToggles: number;
}

async function runResmanTrial(
  stageHost: HTMLElement,
  block: ParsedBlock,
): Promise<ResmanTrialRuntimeResult> {
  stageHost.innerHTML = "";

  const handle = createResmanSubTaskHandle();
  handle.start(stageHost, block.resmanConfig);

  // Sort failure schedule.
  const schedule = [...block.failureSchedule].sort((a, b) => a.timeMs - b.timeMs);
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

      // Inject due failure events.
      while (scheduleIndex < schedule.length && schedule[scheduleIndex].timeMs <= elapsed) {
        const fe = schedule[scheduleIndex];
        handle.handleScenarioEvent?.({
          timeMs: fe.timeMs,
          targetId: "resman",
          command: "set",
          path: `pump.${fe.pumpId}.state`,
          value: fe.state,
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
  const title = asString(taskRaw.title) ?? "MATB Resource Management";

  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructionConfig = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "Manage the tank system by toggling pumps on and off.",
        "Tanks A and B are target tanks — keep their levels in the green zone.",
        "Press numpad keys 1–8 to toggle the corresponding pump.",
        "Pumps may fail (turn red) — failed pumps cannot be toggled.",
      ],
    },
    blockIntroTemplateDefault: "Block with {nTrials} resource management trials. Phase: {phase}.",
  });

  // Base resman config (tanks, pumps, tolerance).
  const resmanConfigRaw = asObject(taskConfig.resman) ?? {};

  const planRaw = asObject(taskConfig.plan) ?? {};
  const blocksRaw = asArray(planRaw.blocks);
  const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};

  const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
    const raw = asObject(entry) ?? {};

    const failureScheduleRaw = asArray(raw.failureSchedule ?? trialDefaultsRaw.failureSchedule);
    const failureSchedule: PumpFailureEvent[] = [];
    for (const fe of failureScheduleRaw) {
      const o = asObject(fe);
      if (!o) continue;
      const pumpId = asString(o.pumpId);
      if (!pumpId) continue;
      const stateStr = asString(o.state) ?? "failure";
      const state = stateStr === "off" ? "off" : stateStr === "on" ? "on" : "failure";
      failureSchedule.push({
        timeMs: toNonNegativeNumber(o.timeMs, 0),
        pumpId,
        state,
      });
    }

    // Allow per-block resman config overrides.
    const blockResmanRaw = asObject(raw.resman) ?? {};
    const mergedResmanConfig: Record<string, unknown> = { ...resmanConfigRaw, ...blockResmanRaw };

    return {
      label: asString(raw.label) ?? `Block ${index + 1}`,
      phase: asString(raw.phase) ?? "main",
      trials: toPositiveNumber(raw.trials, 1),
      trialDurationMs: toPositiveNumber(raw.trialDurationMs ?? trialDefaultsRaw.durationMs, 120000),
      beforeBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "before")),
      afterBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "after")),
      failureSchedule,
      resmanConfig: mergedResmanConfig,
    } satisfies ParsedBlock;
  });

  return {
    title,
    instructions: instructionConfig,
    interTrialIntervalMs: toNonNegativeNumber(taskConfig.interTrialIntervalMs, 300),
    blocks,
    resmanConfig: resmanConfigRaw,
  };
}
