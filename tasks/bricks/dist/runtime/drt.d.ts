import { type DrtEngineData, type DrtEvent } from "@experiments/core";
type BricksDrtConfig = {
    enable?: boolean;
    key?: string;
    response_deadline_ms?: number;
    isi_sampler?: unknown;
    trial?: {
        seed?: unknown;
    };
};
type BricksDrtHooks = {
    onStimStart?: (stim: {
        id: string;
        start: number;
        responded: boolean;
    }) => void;
    onStimEnd?: (stim: {
        id: string;
        start: number;
        responded: boolean;
    }) => void;
};
/**
 * Bricks runtime adapter over the shared core DRT engine.
 * Presentation (audio/visual) remains local to bricks; timing/scoring lives in core.
 */
export declare class DRTController {
    readonly enabled: boolean;
    readonly events: DrtEvent[];
    readonly stats: {
        presented: number;
        hits: number;
        misses: number;
        falseAlarms: number;
    };
    private readonly engine;
    constructor(config: BricksDrtConfig, { onEvent, seed }?: {
        onEvent?: (event: DrtEvent) => void;
        seed?: unknown;
    });
    start(startTimeMs?: number): void;
    step(nowMs: number, hooks?: BricksDrtHooks): void;
    handleKey(eventKey: unknown, nowMs: number, hooks?: Pick<BricksDrtHooks, "onStimEnd">): boolean;
    forceEnd(nowMs: number, hooks?: Pick<BricksDrtHooks, "onStimEnd">): void;
    exportData(): DrtEngineData;
    private syncStats;
}
export {};
