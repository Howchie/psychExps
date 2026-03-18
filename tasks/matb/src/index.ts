/**
 * MATB Composite Task
 *
 * Placeholder entry point for the full MATB multi-task battery.
 * Sub-task handles are re-exported for use by the composite adapter
 * (to be implemented in Phase 5).
 */

export { createTrackingSubTaskHandle } from "./subtasks/tracking";
export type { TrackingSubTaskConfig, TrackingSubTaskResult } from "./subtasks/tracking";

export { createSysmonSubTaskHandle } from "./subtasks/sysmon";
export type { SysmonSubTaskConfig, SysmonSubTaskResult, SysmonSdtRecord } from "./subtasks/sysmon";

export { createResmanSubTaskHandle } from "./subtasks/resman";
export type { ResmanSubTaskConfig, ResmanSubTaskResult, ResmanTankRecord } from "./subtasks/resman";
