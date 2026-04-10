/**
 * MATB Composite Task
 *
 * Exports the composite matbAdapter plus all sub-task handle factories
 * (used by both the composite adapter and the standalone task packages).
 */

export { matbAdapter } from "./adapter";
export type { MatbBlockResult } from "./adapter";

export { createTrackingSubTaskHandle } from "./subtasks/tracking";
export type { TrackingSubTaskConfig, TrackingSubTaskResult, TrackingBin, TrackingExcursionRecord } from "./subtasks/tracking";

export { createSysmonSubTaskHandle } from "./subtasks/sysmon";
export type { SysmonSubTaskConfig, SysmonSubTaskResult, SysmonSdtRecord } from "./subtasks/sysmon";

export { createResmanSubTaskHandle } from "./subtasks/resman";
export type { ResmanSubTaskConfig, ResmanSubTaskResult, ResmanTankRecord, ResmanTickRecord } from "./subtasks/resman";

export { createCommsSubTaskHandle } from "./subtasks/comms";
export type { CommsSubTaskConfig, CommsClipsConfig, CommsSubTaskResult, CommsPromptRecord, CommsOutcome } from "./subtasks/comms";

export { createSchedulingSubTaskHandle } from "./subtasks/scheduling";
export type { SchedulingSubTaskConfig } from "./subtasks/scheduling";

export { createPumpStatusSubTaskHandle } from "./subtasks/pumpstatus";

export { generateMatbScenario } from "./scenarioGenerator";
export type { MatbScenarioConfig } from "./scenarioGenerator";
