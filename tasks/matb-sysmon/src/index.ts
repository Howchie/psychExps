/**
 * MATB System Monitoring Task (standalone adapter).
 *
 * Runs the sysmon sub-task as an independent experiment with block/trial
 * structure. Each "trial" is a timed epoch during which failure events
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
  createSysmonSubTaskHandle,
  type SysmonSdtRecord,
} from "@experiments/task-matb";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export const matbSysmonAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-sysmon",
    label: "MATB System Monitoring",
    variants: [
      { id: "default", label: "MATB Sysmon Default", configPath: "matb-sysmon/default" },
    ],
  },
  run: (context) => runMatbSysmonTask(context),
  terminate: async () => {},
});

// ---------------------------------------------------------------------------
// Parsed config types
// ---------------------------------------------------------------------------

interface FailureEvent {
  /** Time offset within the trial (ms). */
  timeMs: number;
  /** Which gauge to trigger (e.g., "scale1", "light2"). */
  gaugeId: string;
  /** Failure side for scales (-1 or 1). Omit or 0 for random. */
  side?: -1 | 0 | 1;
}

interface ParsedBlock {
  label: string;
  phase: string;
  trials: number;
  trialDurationMs: number;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  /** Failure events injected during each trial. */
  failureSchedule: FailureEvent[];
  /** Sysmon sub-task config overrides for this block. */
  sysmonConfig: Record<string, unknown>;
}

interface ParsedConfig {
  title: string;
  instructions: StandardTaskInstructionConfig;
  interTrialIntervalMs: number;
  blocks: ParsedBlock[];
  sysmonConfig: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Trial record
// ---------------------------------------------------------------------------

interface SysmonTrialRecord {
  participantId: string;
  variantId: string;
  blockIndex: number;
  blockLabel: string;
  trialIndex: number;
  phase: string;
  durationMs: number;
  hitCount: number;
  missCount: number;
  faCount: number;
}

// ---------------------------------------------------------------------------
// Task runner
// ---------------------------------------------------------------------------

async function runMatbSysmonTask(context: TaskAdapterContext): Promise<unknown> {
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
  stageShell.style.width = "320px";
  stageShell.style.height = "420px";
  root.innerHTML = "";
  root.appendChild(stageShell);

  const trialRecords: SysmonTrialRecord[] = [];
  const allSdtRecords: SysmonSdtRecord[] = [];

  const orchestrator = new TaskOrchestrator<ParsedBlock, number, SysmonTrialRuntimeResult>(context);
  applyTaskInstructionConfig(context.taskConfig, parsed.instructions);

  return await orchestrator.run({
    buttonIdPrefix: "matb-sysmon-continue",
    getBlocks: () =>
      parsed.blocks.map((block) => ({
        ...block,
        modules: {},
      })),
    getTrials: ({ block }) => Array.from({ length: block.trials }, (_, i) => i),
    runTrial: async ({ block, blockIndex, trial, trialIndex }) =>
      runTrialWithEnvelope<
        { block: ParsedBlock; blockIndex: number; trial: number; trialIndex: number },
        SysmonTrialRuntimeResult
      >({
        context: { block, blockIndex, trial, trialIndex },
        before: ({ block, blockIndex, trialIndex }) => {
          eventLogger.emit(
            "trial_start",
            { label: block.label, phase: block.phase, mode: "sysmon" },
            { blockIndex, trialIndex },
          );
        },
        execute: ({ block }) =>
          runSysmonTrial(stageShell, block),
        after: async ({ block, blockIndex, trialIndex }, result) => {
          trialRecords.push({
            participantId,
            variantId,
            blockIndex,
            blockLabel: block.label,
            trialIndex,
            phase: block.phase,
            durationMs: result.elapsedMs,
            hitCount: result.hitCount,
            missCount: result.missCount,
            faCount: result.faCount,
          });
          allSdtRecords.push(...result.sdtRecords);

          eventLogger.emit(
            "trial_end",
            {
              durationMs: result.elapsedMs,
              mode: "sysmon",
              hitCount: result.hitCount,
              missCount: result.missCount,
              faCount: result.faCount,
            },
            { blockIndex, trialIndex },
          );

          if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
            await sleep(parsed.interTrialIntervalMs);
          }
        },
      }),
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: "matb-sysmon", runner: "native_sysmon" });
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
      eventLogger.emit("task_complete", { task: "matb-sysmon", nTrials: trialRecords.length });
    },
    csvOptions: {
      suffix: "matb_sysmon_trials",
      getRecords: () => trialRecords,
    },
    getTaskMetadata: () => ({
      config: parsed,
      records: trialRecords,
      sdtRecords: allSdtRecords,
      eventLog: eventLogger.events,
    }),
  });
}

// ---------------------------------------------------------------------------
// Trial runner using the SubTaskHandle
// ---------------------------------------------------------------------------

interface SysmonTrialRuntimeResult {
  elapsedMs: number;
  sdtRecords: SysmonSdtRecord[];
  hitCount: number;
  missCount: number;
  faCount: number;
}

async function runSysmonTrial(
  stageHost: HTMLElement,
  block: ParsedBlock,
): Promise<SysmonTrialRuntimeResult> {
  stageHost.innerHTML = "";

  const handle = createSysmonSubTaskHandle();
  handle.start(stageHost, block.sysmonConfig);

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
          targetId: "sysmon",
          command: "set",
          path: `${fe.gaugeId}.failure`,
          value: true,
        });
        if (fe.side === -1 || fe.side === 1) {
          handle.handleScenarioEvent?.({
            timeMs: fe.timeMs,
            targetId: "sysmon",
            command: "set",
            path: `${fe.gaugeId}.failureSide`,
            value: fe.side,
          });
        }
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
  const title = asString(taskRaw.title) ?? "MATB System Monitoring";

  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructionConfig = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: {
      intro: [
        "Monitor the lights and scales for failures.",
        "Press the labelled key (F1–F6) when you detect a failure.",
        "Lights: F5 should be green (on), F6 should be off. If either changes, press its key.",
        "Scales: arrows should stay in the centre zone. If an arrow drifts to an extreme, press its key.",
      ],
    },
    blockIntroTemplateDefault: "Block with {nTrials} monitoring trials. Phase: {phase}.",
  });

  // Base sysmon config (lights, scales, timeouts).
  const sysmonConfigRaw = asObject(taskConfig.sysmon) ?? {};

  const planRaw = asObject(taskConfig.plan) ?? {};
  const blocksRaw = asArray(planRaw.blocks);
  const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};

  const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
    const raw = asObject(entry) ?? {};

    const failureScheduleRaw = asArray(raw.failureSchedule ?? trialDefaultsRaw.failureSchedule);
    const failureSchedule: FailureEvent[] = [];
    for (const fe of failureScheduleRaw) {
      const o = asObject(fe);
      if (!o) continue;
      const gaugeId = asString(o.gaugeId);
      if (!gaugeId) continue;
      failureSchedule.push({
        timeMs: toNonNegativeNumber(o.timeMs, 0),
        gaugeId,
        side: Number(o.side) === -1 ? -1 : Number(o.side) === 1 ? 1 : 0,
      });
    }

    // Allow per-block sysmon config overrides.
    const blockSysmonRaw = asObject(raw.sysmon) ?? {};
    const mergedSysmonConfig: Record<string, unknown> = { ...sysmonConfigRaw, ...blockSysmonRaw };

    return {
      label: asString(raw.label) ?? `Block ${index + 1}`,
      phase: asString(raw.phase) ?? "main",
      trials: toPositiveNumber(raw.trials, 1),
      trialDurationMs: toPositiveNumber(raw.trialDurationMs ?? trialDefaultsRaw.durationMs, 60000),
      beforeBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "before")),
      afterBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "after")),
      failureSchedule,
      sysmonConfig: mergedSysmonConfig,
    } satisfies ParsedBlock;
  });

  return {
    title,
    instructions: instructionConfig,
    interTrialIntervalMs: toNonNegativeNumber(taskConfig.interTrialIntervalMs, 300),
    blocks,
    sysmonConfig: sysmonConfigRaw,
  };
}
