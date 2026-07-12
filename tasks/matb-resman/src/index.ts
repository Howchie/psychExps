/**
 * MATB Resource Management Task (standalone adapter).
 *
 * Runs the resman sub-task as an independent experiment with block/trial
 * structure. Each "trial" is a timed epoch during which pump failures
 * are injected according to a schedule defined in the config.
 *
 * The core state machine and rendering live in @experiments/task-matb;
 * the block/epoch scaffolding is the shared core epoch runner.
 */

import {
  asString,
  createTaskAdapter,
  runEpochSubTaskStandalone,
  toNonNegativeNumber,
  type EpochStandaloneTaskSpec,
} from "@experiments/core";
import {
  createResmanSubTaskHandle,
  type ResmanSubTaskResult,
} from "@experiments/task-matb";

interface PumpFailureEvent {
  /** Time offset within the trial (ms). */
  timeMs: number;
  /** Pump ID to fail (e.g., "3"). */
  pumpId: string;
  /** State to set: "failure" or "off" (to restore). */
  state: "failure" | "off" | "on";
}

const resmanSpec: EpochStandaloneTaskSpec<PumpFailureEvent, ResmanSubTaskResult> = {
  taskId: "matb-resman",
  mode: "resman",
  runnerName: "native_resman",
  defaultTitle: "MATB Resource Management",
  buttonIdPrefix: "matb-resman-continue",
  csvSuffix: "matb_resman_trials",
  stageSize: { widthPx: 360, heightPx: 420 },
  subTaskConfigKey: "resman",
  scheduleKey: "failureSchedule",
  instructionIntroDefaults: [
    "Manage the tank system by toggling pumps on and off.",
    "Tanks A and B are target tanks — keep their levels in the green zone.",
    "Press numpad keys 1–8 to toggle the corresponding pump.",
    "Pumps may fail (turn red) — failed pumps cannot be toggled.",
  ],
  blockIntroTemplateDefault: "Block with {nTrials} resource management trials. Phase: {phase}.",
  defaultTrialDurationMs: 120000,
  defaultInterTrialIntervalMs: 300,
  createHandle: () => createResmanSubTaskHandle(),
  parseScheduleEntry: (raw) => {
    const pumpId = asString(raw.pumpId);
    if (!pumpId) return null;
    const stateStr = asString(raw.state) ?? "failure";
    const state = stateStr === "off" ? "off" : stateStr === "on" ? "on" : "failure";
    return {
      timeMs: toNonNegativeNumber(raw.timeMs, 0),
      pumpId,
      state,
    };
  },
  toScenarioEvents: (event) => [
    {
      timeMs: event.timeMs,
      targetId: "resman",
      command: "set",
      path: `pump.${event.pumpId}.state`,
      value: event.state,
    },
  ],
  trialRecordFields: (result) => {
    const tankA = result.tankRecords.find((t) => t.tankId === "a");
    const tankB = result.tankRecords.find((t) => t.tankId === "b");
    return {
      pumpToggles: result.pumpToggles,
      tankA_meanDeviation: tankA?.meanDeviation ?? null,
      tankA_propInTolerance: tankA?.proportionInTolerance ?? null,
      tankB_meanDeviation: tankB?.meanDeviation ?? null,
      tankB_propInTolerance: tankB?.proportionInTolerance ?? null,
    };
  },
  trialEndEventFields: (result) => ({
    pumpToggles: result.pumpToggles,
  }),
  // Preserve the historical metadata shape: one entry per trial holding that
  // trial's array of tank records.
  auxMetadataKey: "tankRecords",
  collectAuxRecords: (result) => [result.tankRecords],
};

export const matbResmanAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-resman",
    label: "MATB Resource Management",
  },
  run: (context) => runEpochSubTaskStandalone(context, resmanSpec),
  terminate: async () => {},
});
