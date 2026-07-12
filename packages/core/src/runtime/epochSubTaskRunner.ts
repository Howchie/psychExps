/**
 * Standalone epoch runner for concurrent-style sub-tasks.
 *
 * Runs any `SubTaskHandle` as an independent orchestrated experiment: each
 * "trial" is a timed epoch during which scenario events are injected according
 * to a schedule declared in the task config. The MATB standalone adapters
 * (comms, sysmon, resman) are thin specs over this runner; any future
 * continuously-simulated sub-task can reuse it the same way.
 */

import {
  asArray,
  asObject,
  asString,
  toNonNegativeNumber,
  toPositiveNumber,
  toStringScreens,
  resolveBlockScreenSlotValue,
} from "../utils/coerce";
import type { TaskAdapterContext } from "../api/types";
import type { SubTaskHandle } from "./concurrentRunner";
import type { ScenarioEvent } from "./scenarioScheduler";
import {
  applyTaskInstructionConfig,
  buildTaskInstructionConfig,
  type StandardTaskInstructionConfig,
} from "./taskInstructions";
import { TaskOrchestrator } from "./orchestrator";
import { runTrialWithEnvelope } from "./trialExecution";
import { sleep } from "../web/ui";

export interface EpochScheduleEventBase {
  /** Time offset within the trial (ms). */
  timeMs: number;
}

export interface EpochParsedBlock<TScheduleEvent extends EpochScheduleEventBase> {
  label: string;
  phase: string;
  trials: number;
  trialDurationMs: number;
  beforeBlockScreens: string[];
  afterBlockScreens: string[];
  /** Scenario events injected during each trial of this block. */
  schedule: TScheduleEvent[];
  /** Sub-task config (base config merged with per-block overrides). */
  subTaskConfig: Record<string, unknown>;
}

export interface EpochParsedConfig<TScheduleEvent extends EpochScheduleEventBase> {
  title: string;
  instructions: StandardTaskInstructionConfig;
  interTrialIntervalMs: number;
  blocks: Array<EpochParsedBlock<TScheduleEvent>>;
  subTaskConfig: Record<string, unknown>;
}

export interface EpochStandaloneTaskSpec<
  TScheduleEvent extends EpochScheduleEventBase,
  TResult extends { elapsedMs: number },
> {
  /** Task id used in task_start/task_complete events (e.g. "matb-comms"). */
  taskId: string;
  /** Short mode label attached to trial events (e.g. "comms"). */
  mode: string;
  /** Runner label attached to the task_start event (e.g. "native_comms"). */
  runnerName: string;
  defaultTitle: string;
  buttonIdPrefix: string;
  csvSuffix: string;
  stageSize: { widthPx: number; heightPx: number };
  /** Config key holding the sub-task config, at task level and per block (e.g. "comms"). */
  subTaskConfigKey: string;
  /** Config key holding the per-block (or trialDefaults) schedule array (e.g. "promptSchedule"). */
  scheduleKey: string;
  instructionIntroDefaults: string[];
  blockIntroTemplateDefault: string;
  defaultTrialDurationMs: number;
  defaultInterTrialIntervalMs: number;
  createHandle: () => SubTaskHandle<TResult>;
  /** Parse one raw schedule entry; return null to skip malformed entries. */
  parseScheduleEntry: (raw: Record<string, unknown>) => TScheduleEvent | null;
  /** Expand one schedule entry into the scenario event(s) delivered to the handle. */
  toScenarioEvents: (event: TScheduleEvent) => ScenarioEvent[];
  /** Task-specific columns appended to each trial record (after the shared columns). */
  trialRecordFields: (result: TResult) => Record<string, unknown>;
  /** Task-specific fields for the trial_end event; defaults to trialRecordFields. */
  trialEndEventFields?: (result: TResult) => Record<string, unknown>;
  /** Metadata key for accumulated per-trial auxiliary records (e.g. "promptRecords"). */
  auxMetadataKey?: string;
  /** Extract auxiliary records from one trial result to accumulate under auxMetadataKey. */
  collectAuxRecords?: (result: TResult) => unknown[];
}

export function parseEpochStandaloneConfig<TScheduleEvent extends EpochScheduleEventBase>(
  taskConfig: Record<string, unknown>,
  spec: Pick<
    EpochStandaloneTaskSpec<TScheduleEvent, { elapsedMs: number }>,
    | "defaultTitle"
    | "subTaskConfigKey"
    | "scheduleKey"
    | "instructionIntroDefaults"
    | "blockIntroTemplateDefault"
    | "defaultTrialDurationMs"
    | "defaultInterTrialIntervalMs"
    | "parseScheduleEntry"
  >,
): EpochParsedConfig<TScheduleEvent> {
  const taskRaw = asObject(taskConfig.task) ?? {};
  const title = asString(taskRaw.title) ?? spec.defaultTitle;

  const instructionsRaw = asObject(taskConfig.instructions) ?? {};
  const instructions = buildTaskInstructionConfig({
    title,
    instructions: instructionsRaw,
    defaults: { intro: spec.instructionIntroDefaults },
    blockIntroTemplateDefault: spec.blockIntroTemplateDefault,
  });

  const baseSubTaskConfig = asObject(taskConfig[spec.subTaskConfigKey]) ?? {};

  const planRaw = asObject(taskConfig.plan) ?? {};
  const blocksRaw = asArray(planRaw.blocks);
  const trialDefaultsRaw = asObject(taskConfig.trialDefaults) ?? {};

  const blocks = (blocksRaw.length > 0 ? blocksRaw : [{}]).map((entry, index) => {
    const raw = asObject(entry) ?? {};

    const scheduleRaw = asArray(raw[spec.scheduleKey] ?? trialDefaultsRaw[spec.scheduleKey]);
    const schedule: TScheduleEvent[] = [];
    for (const item of scheduleRaw) {
      const itemRaw = asObject(item);
      if (!itemRaw) continue;
      const parsedEvent = spec.parseScheduleEntry(itemRaw);
      if (parsedEvent) schedule.push(parsedEvent);
    }

    const blockOverrides = asObject(raw[spec.subTaskConfigKey]) ?? {};

    return {
      label: asString(raw.label) ?? `Block ${index + 1}`,
      phase: asString(raw.phase) ?? "main",
      trials: toPositiveNumber(raw.trials, 1),
      trialDurationMs: toPositiveNumber(
        raw.trialDurationMs ?? trialDefaultsRaw.durationMs,
        spec.defaultTrialDurationMs,
      ),
      beforeBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "before")),
      afterBlockScreens: toStringScreens(resolveBlockScreenSlotValue(raw, "after")),
      schedule,
      subTaskConfig: { ...baseSubTaskConfig, ...blockOverrides },
    } satisfies EpochParsedBlock<TScheduleEvent>;
  });

  return {
    title,
    instructions,
    interTrialIntervalMs: toNonNegativeNumber(
      taskConfig.interTrialIntervalMs,
      spec.defaultInterTrialIntervalMs,
    ),
    blocks,
    subTaskConfig: baseSubTaskConfig,
  };
}

async function runEpochTrial<
  TScheduleEvent extends EpochScheduleEventBase,
  TResult extends { elapsedMs: number },
>(
  stageHost: HTMLElement,
  block: EpochParsedBlock<TScheduleEvent>,
  spec: EpochStandaloneTaskSpec<TScheduleEvent, TResult>,
): Promise<TResult> {
  stageHost.innerHTML = "";

  const handle = spec.createHandle();
  handle.start(stageHost, block.subTaskConfig);

  const schedule = [...block.schedule].sort((a, b) => a.timeMs - b.timeMs);
  let scheduleIndex = 0;

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

      // Inject due scenario events.
      while (scheduleIndex < schedule.length && schedule[scheduleIndex].timeMs <= elapsed) {
        for (const scenarioEvent of spec.toScenarioEvents(schedule[scheduleIndex])) {
          handle.handleScenarioEvent?.(scenarioEvent);
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

  return handle.stop();
}

export async function runEpochSubTaskStandalone<
  TScheduleEvent extends EpochScheduleEventBase,
  TResult extends { elapsedMs: number },
>(context: TaskAdapterContext, spec: EpochStandaloneTaskSpec<TScheduleEvent, TResult>): Promise<unknown> {
  const parsed = parseEpochStandaloneConfig<TScheduleEvent>(context.taskConfig, spec);
  const participantId = context.selection.participant.participantId;
  const configPath = context.selection.configPath ?? "";
  const eventLogger = context.eventLogger;

  const root = context.container;
  root.style.fontFamily = "system-ui";

  const stageShell = document.createElement("div");
  stageShell.style.display = "flex";
  stageShell.style.justifyContent = "center";
  stageShell.style.alignItems = "center";
  stageShell.style.width = `${spec.stageSize.widthPx}px`;
  stageShell.style.height = `${spec.stageSize.heightPx}px`;
  root.innerHTML = "";
  root.appendChild(stageShell);

  const trialRecords: Array<Record<string, unknown>> = [];
  const auxRecords: unknown[] = [];

  const orchestrator = new TaskOrchestrator<EpochParsedBlock<TScheduleEvent>, number, TResult>(context);
  applyTaskInstructionConfig(context.taskConfig, parsed.instructions);

  return await orchestrator.run({
    buttonIdPrefix: spec.buttonIdPrefix,
    getBlocks: () =>
      parsed.blocks.map((block) => ({
        ...block,
        modules: {},
      })),
    getTrials: ({ block }) => Array.from({ length: block.trials }, (_, i) => i),
    runTrial: async ({ block, blockIndex, trial, trialIndex }) =>
      runTrialWithEnvelope<
        { block: EpochParsedBlock<TScheduleEvent>; blockIndex: number; trial: number; trialIndex: number },
        TResult
      >({
        context: { block, blockIndex, trial, trialIndex },
        before: ({ block, blockIndex, trialIndex }) => {
          eventLogger.emit(
            "trial_start",
            { label: block.label, phase: block.phase, mode: spec.mode },
            { blockIndex, trialIndex },
          );
        },
        execute: ({ block }) => runEpochTrial(stageShell, block, spec),
        after: async ({ block, blockIndex, trialIndex }, result) => {
          trialRecords.push({
            participantId,
            configPath,
            blockIndex,
            blockLabel: block.label,
            trialIndex,
            phase: block.phase,
            durationMs: result.elapsedMs,
            ...spec.trialRecordFields(result),
          });
          if (spec.collectAuxRecords) {
            auxRecords.push(...spec.collectAuxRecords(result));
          }

          eventLogger.emit(
            "trial_end",
            {
              durationMs: result.elapsedMs,
              mode: spec.mode,
              ...(spec.trialEndEventFields ?? spec.trialRecordFields)(result),
            },
            { blockIndex, trialIndex },
          );

          if (parsed.interTrialIntervalMs > 0 && trialIndex < block.trials - 1) {
            await sleep(parsed.interTrialIntervalMs);
          }
        },
      }),
    onTaskStart: () => {
      eventLogger.emit("task_start", { task: spec.taskId, runner: spec.runnerName });
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
      eventLogger.emit("task_complete", { task: spec.taskId, nTrials: trialRecords.length });
    },
    csvOptions: {
      suffix: spec.csvSuffix,
      getRecords: () => trialRecords,
    },
    getTaskMetadata: () => ({
      config: parsed,
      records: trialRecords,
      ...(spec.auxMetadataKey ? { [spec.auxMetadataKey]: auxRecords } : {}),
      eventLog: eventLogger.events,
    }),
  });
}
