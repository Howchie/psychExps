export declare function asObject(value: unknown): Record<string, unknown> | null;
export declare function asArray(value: unknown): unknown[];
export declare function asString(value: unknown): string | null;
export declare function toPositiveNumber(value: unknown, fallback: number): number;
export declare function toNonNegativeNumber(value: unknown, fallback: number): number;
export declare function toUnitNumber(value: unknown, fallback: number): number;
export declare function toFiniteNumber(value: unknown, fallback: number): number;
export declare function toNumberArray(value: unknown, fallback: number[]): number[];
export declare function toStringScreens(value: unknown): string[];
export interface InstructionPageSlots {
    intro: string[];
    preBlock: string[];
    postBlock: string[];
    end: string[];
}
export declare function resolveInstructionPageSlots(instructions: unknown, defaults?: Partial<InstructionPageSlots>): InstructionPageSlots;
