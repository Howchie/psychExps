import type { JSONObject } from "../api/types";
import { type InstructionFlowPages } from "../web/instructionFlow";
export interface ResolvedTaskInstructionSurfaces {
    introPages?: unknown;
    preBlockPages?: unknown;
    postBlockPages?: unknown;
    endPages?: unknown;
    blockIntroTemplate?: unknown;
    showBlockLabel?: boolean;
    preBlockBeforeIntro?: boolean;
    blockSummary?: unknown;
}
export interface StandardTaskInstructionConfig {
    introPages: unknown;
    preBlockPages: unknown;
    postBlockPages: unknown;
    endPages: unknown;
    blockIntroTemplate: string;
    showBlockLabel: boolean;
    preBlockBeforeBlockIntro: boolean;
    blockSummary?: unknown;
}
export declare function buildTaskInstructionConfig(args: {
    title?: string | null;
    instructions?: unknown;
    defaults?: Partial<InstructionFlowPages>;
    blockIntroTemplateDefault?: string;
    showBlockLabelDefault?: boolean;
    preBlockBeforeBlockIntroDefault?: boolean;
}): StandardTaskInstructionConfig;
export declare function applyResolvedTaskInstructionSurfaces(taskConfig: JSONObject, surfaces: ResolvedTaskInstructionSurfaces): void;
export declare function applyTaskInstructionConfig(taskConfig: JSONObject, instructions: StandardTaskInstructionConfig): void;
