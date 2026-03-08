import { DrtController } from '@experiments/core';
import type { BricksScopedDrtConfig } from './drtConfig.js';
export interface ConveyorTrialRunArgs {
    displayElement: HTMLElement;
    blockLabel: string;
    blockIndex: number;
    trialIndex: number;
    config: Record<string, unknown>;
    drtRuntime?: ConveyorTrialDrtRuntime;
}
export interface ConveyorTrialData {
    block_label: string;
    block_index: number;
    trial_index: number;
    trial_duration_ms: number;
    end_reason: string;
    runtime_conveyor_lengths: number[];
    difficulty_estimate: unknown;
    resolved_display_preset_id: string | null;
    config_snapshot: Record<string, unknown>;
    game: unknown;
    drt: unknown;
    timeline_events: Array<Record<string, unknown>>;
    performance?: Record<string, unknown>;
}
export interface ConveyorTrialDrtRuntimeBindings {
    displayElement?: HTMLElement | null;
    getElapsedMs: () => number;
    onEvent: (event: Record<string, unknown>) => void;
    onStimStart: (stimulus: Record<string, unknown>) => void;
    onStimEnd: (stimulus: Record<string, unknown>) => void;
}
export interface ConveyorTrialDrtRuntime {
    config: BricksScopedDrtConfig;
    controller: DrtController;
    stopOnCleanup?: boolean;
    attachBindings?: (bindings: ConveyorTrialDrtRuntimeBindings) => void;
    detachBindings?: () => void;
}
export declare function runConveyorTrial(args: ConveyorTrialRunArgs): Promise<ConveyorTrialData>;
