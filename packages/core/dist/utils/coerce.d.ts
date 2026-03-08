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
