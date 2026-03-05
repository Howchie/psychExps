import { type ScopedDrtConfig } from "@experiments/core";
export declare const defaultBricksScopedDrtConfig: ScopedDrtConfig;
export type BricksScopedDrtConfig = ScopedDrtConfig;
export declare function resolveBricksDrtConfig(raw: Record<string, unknown> | null | undefined): BricksScopedDrtConfig;
