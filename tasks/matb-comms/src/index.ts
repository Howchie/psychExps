/**
 * MATB Communications Task (standalone adapter).
 *
 * Runs the comms sub-task as an independent experiment with block/trial
 * structure. Each "trial" is a timed epoch during which prompt events
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
  toPositiveFloat,
  type EpochStandaloneTaskSpec,
} from "@experiments/core";
import {
  createCommsSubTaskHandle,
  type CommsSubTaskResult,
} from "@experiments/task-matb";

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

const commsSpec: EpochStandaloneTaskSpec<PromptEvent, CommsSubTaskResult> = {
  taskId: "matb-comms",
  mode: "comms",
  runnerName: "native_comms",
  defaultTitle: "MATB Communications",
  buttonIdPrefix: "matb-comms-continue",
  csvSuffix: "matb_comms_trials",
  stageSize: { widthPx: 320, heightPx: 420 },
  subTaskConfigKey: "comms",
  scheduleKey: "promptSchedule",
  instructionIntroDefaults: [
    "Listen carefully to the audio prompts.",
    "Each prompt announces a callsign, a radio (NAV1, NAV2, COM1, or COM2), and a frequency.",
    "If the callsign is yours, use the arrow keys to select the correct radio and tune it to the announced frequency, then press Enter to confirm.",
    "If it is someone else's callsign, do not respond.",
    "↑↓ to select a radio  |  ←→ to tune frequency  |  Enter to confirm",
  ],
  blockIntroTemplateDefault: "Block with {nTrials} communications trial(s). Phase: {phase}.",
  defaultTrialDurationMs: 120000,
  defaultInterTrialIntervalMs: 500,
  createHandle: () => createCommsSubTaskHandle(),
  parseScheduleEntry: (raw) => {
    const callsign = asString(raw.callsign);
    const radio = asString(raw.radio);
    if (!callsign || !radio) return null;
    return {
      timeMs: toNonNegativeNumber(raw.timeMs, 0),
      callsign,
      radio,
      frequency: toPositiveFloat(raw.frequency, 118.0),
    };
  },
  toScenarioEvents: (event) => [
    {
      timeMs: event.timeMs,
      targetId: "comms",
      command: "prompt",
      value: { callsign: event.callsign, radio: event.radio, frequency: event.frequency },
    },
  ],
  trialRecordFields: (result) => ({
    hitCount: result.hitCount,
    missCount: result.missCount,
    faCount: result.faCount,
    crCount: result.crCount,
  }),
  auxMetadataKey: "promptRecords",
  collectAuxRecords: (result) => result.records,
};

export const matbCommsAdapter = createTaskAdapter({
  manifest: {
    taskId: "matb-comms",
    label: "MATB Communications",
  },
  run: (context) => runEpochSubTaskStandalone(context, commsSpec),
  terminate: async () => {},
});
