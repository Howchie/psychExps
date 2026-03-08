import { DrtController, type ScopedDrtConfig } from "../engines/drt";
import type { TaskModuleContext, TaskModuleResult, TaskModuleRunner } from "../api/taskModule";
export interface StartDrtModuleScopeArgs {
    runner: TaskModuleRunner;
    drtConfig: ScopedDrtConfig;
    scope: "block" | "trial";
    blockIndex: number;
    trialIndex: number | null;
    participantId: string;
    sessionId: string;
    variantId: string;
    taskSeedKey: string;
    seedSuffix?: string;
    onControllerCreated?: (controller: DrtController) => void;
    context: Pick<TaskModuleContext, "displayElement" | "borderTargetElement" | "borderTargetRect">;
}
export declare function startDrtModuleScope(args: StartDrtModuleScopeArgs): void;
export declare function stopModuleScope(args: {
    runner: TaskModuleRunner;
    scope: "block" | "trial";
    blockIndex: number;
    trialIndex: number | null;
}): TaskModuleResult | undefined;
