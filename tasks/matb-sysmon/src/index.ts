/**
 * MATB System Monitoring Task (standalone adapter).
 *
 * Runs the sysmon sub-task as an independent experiment with block/trial
 * structure. Each "trial" is a timed epoch during which failure events
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
  type ScenarioEvent,
} from "@experiments/core";
import {
  createSysmonSubTaskHandle,
  type SysmonSubTaskResult,
} from "@experiments/task-matb";

interface FailureEvent {
  /** Time offset within the trial (ms). */
  timeMs: number;
  /** Which gauge to trigger (e.g., "scale1", "light2"). */
  gaugeId: string;
  /** Failure side for scales (-1 or 1). Omit or 0 for random. */
  side?: -1 | 0 | 1;
}

const sysmonSpec: EpochStandaloneTaskSpec<FailureEvent, SysmonSubTaskResult> = {
  taskId: "matb-sysmon",
  mode: "sysmon",
  runnerName: "native_sysmon",
  defaultTitle: "MATB System Monitoring",
  buttonIdPrefix: "matb-sysmon-continue",
  csvSuffix: "matb_sysmon_trials",
  stageSize: { widthPx: 320, heightPx: 420 },
  subTaskConfigKey: "sysmon",
  scheduleKey: "failureSchedule",
  instructionIntroDefaults: [
    "Monitor the lights and scales for failures.",
    "Press the labelled key (F1–F6) when you detect a failure.",
    "Lights: F5 should be green (on), F6 should be off. If either changes, press its key.",
    "Scales: arrows should stay in the centre zone. If an arrow drifts to an extreme, press its key.",
  ],
  blockIntroTemplateDefault: "Block with {nTrials} monitoring trials. Phase: {phase}.",
  defaultTrialDurationMs: 60000,
  defaultInterTrialIntervalMs: 300,
  createHandle: () => createSysmonSubTaskHandle(),
  parseScheduleEntry: (raw) => {
    const gaugeId = asString(raw.gaugeId);
    if (!gaugeId) return null;
    return {
      timeMs: toNonNegativeNumber(raw.timeMs, 0),
      gaugeId,
      side: Number(raw.side) === -1 ? -1 : Number(raw.side) === 1 ? 1 : 0,
    };
  },
  toScenarioEvents: (event) => {
    const events: ScenarioEvent[] = [
      {
        timeMs: event.timeMs,
        targetId: "sysmon",
        command: "set",
        path: `${event.gaugeId}.failure`,
        value: true,
      },
    ];
    if (event.side === -1 || event.side === 1) {
      events.push({
        timeMs: event.timeMs,
        targetId: "sysmon",
        command: "set",
        path: `${event.gaugeId}.failureSide`,
        value: event.side,
      });
    }
    return events;
  },
  trialRecordFields: (result) => ({
    hitCount: result.hitCount,
    missCount: result.missCount,
    faCount: result.faCount,
  }),
  auxMetadataKey: "sdtRecords",
  collectAuxRecords: (result) => result.sdtRecords,
};

export const matbSysmonAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-sysmon",
    label: "MATB System Monitoring",
  },
  run: (context) => runEpochSubTaskStandalone(context, sysmonSpec),
  terminate: async () => {},
});
