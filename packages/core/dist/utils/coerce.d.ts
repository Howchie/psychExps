export declare function asObject(value: unknown): Record<string, unknown> | null;
export declare function asArray(value: unknown): unknown[];
export declare function asString(value: unknown): string | null;
export declare function toPositiveNumber(value: unknown, fallback: number): number;
export declare function toNonNegativeNumber(value: unknown, fallback: number): number;
export declare function toUnitNumber(value: unknown, fallback: number): number;
export declare function toFiniteNumber(value: unknown, fallback: number): number;
export declare function toNumberArray(value: unknown, fallback: number[]): number[];
export declare function toStringScreens(value: unknown): string[];
export declare function asStringArray(value: unknown, fallback: string[]): string[];
export declare function asPositiveNumberArray(value: unknown, fallback: number[]): number[];
export type InstructionInsertionPoint = "task_intro_before" | "task_intro_after" | "block_start_before_intro" | "block_start_after_intro" | "block_start_after_pre" | "block_end_before_post" | "block_end_after_post" | "task_end_before" | "task_end_after";
export interface InstructionInsertionWhen {
    blockIndex?: number[];
    blockLabel?: string[];
    blockType?: string[];
    isPractice?: boolean;
}
export interface InstructionInsertion {
    id?: string;
    at: InstructionInsertionPoint;
    pages: InstructionScreenSpec[];
    when?: InstructionInsertionWhen;
}
export declare function coerceInstructionInsertions(value: unknown): InstructionInsertion[];
export interface InstructionPageSlots {
    intro: string[];
    preBlock: string[];
    postBlock: string[];
    end: string[];
}
export interface InstructionScreenSpec {
    title?: string;
    text?: string;
    html?: string;
    actions?: InstructionScreenAction[];
}
export interface InstructionScreenAction {
    id?: string;
    label: string;
    action?: "continue" | "exit";
}
export declare function resolveInstructionPageSlots(instructions: unknown, defaults?: Partial<InstructionPageSlots>): InstructionPageSlots;
export interface InstructionScreenSlots {
    intro: InstructionScreenSpec[];
    preBlock: InstructionScreenSpec[];
    postBlock: InstructionScreenSpec[];
    end: InstructionScreenSpec[];
}
export declare function toInstructionScreenSpecs(value: unknown): InstructionScreenSpec[];
export declare function resolveInstructionScreenSlots(instructions: unknown, defaults?: Partial<InstructionScreenSlots>): InstructionScreenSlots;
