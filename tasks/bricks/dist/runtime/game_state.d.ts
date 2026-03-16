import type { CoreRng } from '@experiments/core';
declare const BRICK_STATUS: {
    readonly ACTIVE: "active";
    readonly CLEARED: "cleared";
    readonly DROPPED: "dropped";
};
interface BrickRecord {
    id: string;
    conveyorId: string;
    status: string;
    x: number;
    y: number;
    speed: number;
    width: number;
    initialWidth: number;
    height: number;
    createdAt: number;
    clicks: number;
    holds: number;
    clearProgress: number;
    isHovered: boolean;
    color: string;
    borderColor: string | null;
    shape: string;
    textureStyle: string | null;
    colorCategoryId: string | null;
    colorCategoryLabel: string | null;
    widthCategoryId: string | null;
    widthCategoryLabel: string | null;
    borderColorCategoryId: string | null;
    borderColorCategoryLabel: string | null;
    shapeCategoryId: string | null;
    shapeCategoryLabel: string | null;
    textureCategoryId: string | null;
    textureCategoryLabel: string | null;
    value: number;
    isTarget: boolean;
    workDeadlineMs: number | null;
    targetHoldMs: number | null;
    progressPerPerfect: number | null;
    forcedSetIndex: number | null;
    label: string | null;
}
interface ConveyorRecord {
    id: string;
    index: number;
    y: number;
    length: number;
    speed: number;
    interSpawnSampler: () => number;
    nextSpawnAt: number;
    activeIds: string[];
}
interface CategoryEntry {
    id: string;
    label: string | null;
    dimension: string;
    traits: Record<string, unknown>;
}
interface CategoryPalettes {
    color: CategoryEntry[];
    width: CategoryEntry[];
    borderColor: CategoryEntry[];
    shape: CategoryEntry[];
    texture: CategoryEntry[];
}
interface ForcedControlState {
    enabled: boolean;
    switchMode: string;
    switchIntervalMs: number;
    switchOnDrop: boolean;
    sequence: unknown[] | null;
    spotlightPadding: number;
    dimAlpha: number;
    coverStory: {
        enableAmmoCue: boolean;
    };
    activeOrderIndex: number;
    activeBrickId: string | null;
    nextSwitchAtMs: number | null;
    orderedBrickIds: string[];
}
interface GameStats {
    spawned: number;
    cleared: number;
    dropped: number;
    clickErrors: number;
    points: number;
}
interface GameEvent {
    time: number;
    type: string;
    [key: string]: unknown;
}
interface PointerPos {
    x?: number | null;
    y?: number | null;
}
/**
 * Represents the trial-level game state, including conveyors, bricks, and
 * high-level statistics. Rendering and jsPsych plugin orchestrate updates
 * via the public methods exposed here.
 */
export declare class GameState {
    activeBricks: BrickRecord[];
    config: Record<string, any>;
    onEvent: (event: GameEvent) => void;
    rng: CoreRng;
    samplerCache: WeakMap<object, () => unknown>;
    elapsed: number;
    events: GameEvent[];
    stats: GameStats;
    bricks: Map<string, BrickRecord>;
    conveyors: ConveyorRecord[];
    conveyorsById: Map<string, ConveyorRecord>;
    spawnControllers: unknown[];
    pendingDropVisuals: Record<string, unknown>[];
    pendingClearVisuals: Record<string, unknown>[];
    nextBrickId: number;
    globalInterSpawnSampler: () => number;
    nextGlobalSpawnAt: number;
    defaultConveyorLength: number;
    categoryPalettes: CategoryPalettes;
    brickCategories: CategoryEntry[];
    forcedControl: ForcedControlState;
    constructor(config: Record<string, any>, { onEvent, seed }?: {
        onEvent?: (event: GameEvent) => void;
        seed?: unknown;
    });
    _log(type: string, payload?: Record<string, unknown>): void;
    _initConveyors(): void;
    _initBricks(): void;
    _initForcedBricks(): boolean;
    _materializeForcedSet(): any;
    _generateForcedSetFromPlan(plan: Record<string, any>): Record<string, unknown>[];
    _createForcedPlanFieldResolver(fieldSpec: unknown): (index: number) => unknown;
    _sampleField(spec: unknown): unknown;
    _resolveValue(spec: unknown): number;
    _prepareBrickCategories(): {
        color: CategoryEntry[];
        width: CategoryEntry[];
        borderColor: CategoryEntry[];
        shape: CategoryEntry[];
        texture: CategoryEntry[];
    };
    _normalizeBrickShape(rawShape: unknown): string | null;
    _isSamplerSpec(value: unknown): boolean;
    _collectCategoryTraitSpecs(source: unknown): Record<string, unknown>;
    _materializeBrickTraits(traitSpecs: unknown): Record<string, unknown>;
    _pickRandomCategory(dimension: keyof CategoryPalettes): CategoryEntry | null;
    _resolveCategoryById(dimension: keyof CategoryPalettes, id: unknown): CategoryEntry | null;
    _resolveCategorySelectionsForEntry(entry: Record<string, any>): {
        color: CategoryEntry | null;
        width: CategoryEntry | null;
        borderColor: CategoryEntry | null;
        shape: CategoryEntry | null;
        texture: CategoryEntry | null;
    };
    _resolveBrickTraits({ categories, traits, metadata }?: {
        categories?: Record<string, any> | null;
        traits?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
    }): {
        categories: {
            color: any;
            width: any;
            borderColor: any;
            shape: any;
            texture: any;
        };
        traits: Record<string, unknown>;
    };
    _makeLengthSampler(lengthSpec: unknown): () => number;
    _makeInterSpawnSampler(spawnCfg?: Record<string, any>): () => number;
    _buildForcedControlConfig(): {
        enabled: boolean;
        switchMode: string;
        switchIntervalMs: number;
        switchOnDrop: boolean;
        sequence: any;
        spotlightPadding: number;
        dimAlpha: number;
        coverStory: {
            enableAmmoCue: boolean;
        };
        activeOrderIndex: number;
        activeBrickId: null;
        nextSwitchAtMs: null;
        orderedBrickIds: never[];
    };
    _initForcedControl(): void;
    _setForcedActiveBrick(orderIndex: number, reason: string): void;
    _advanceForcedActiveBrick(reason: string): void;
    _scheduleForcedTimedSwitch(): void;
    _computeBrickY(conveyorY: number, brickHeight: number): number;
    /**
     * Spawns a new brick on the given conveyor if safety constraints permit.
     */
    _spawnBrick(conveyor: ConveyorRecord, { x, reason, bypassSpacing, categories, traits, metadata }?: {
        x?: number;
        reason?: string;
        bypassSpacing?: boolean;
        categories?: Record<string, any> | null;
        traits?: Record<string, unknown> | null;
        metadata?: Record<string, unknown> | null;
    }): boolean;
    handleBrickHover(brickId: string, isHovering: boolean, timestamp: number, pointerPos?: PointerPos): void;
    /**
     * Removes a brick and updates stats/logging.
     */
    _finalizeBrick(brick: BrickRecord, status: string, payload?: Record<string, unknown>): void;
    _isCurrentForcedBrick(brickId: string): boolean;
    _canWorkOnBrick(brick: BrickRecord): {
        ok: boolean;
        reason: string;
    } | {
        ok: boolean;
        reason: null;
    };
    /**
     * Handles player interaction depending on completion mode.
     */
    handleBrickInteraction(brickId: string, timestamp: number, clickPos?: PointerPos): void;
    handleBrickHold(brickId: string, holdDurationMs: number, timestamp: number, clickPos?: PointerPos): void;
    /**
     * Advances the simulation by dt milliseconds.
     */
    step(dtMs: number): void;
    /**
     * Returns a lightweight snapshot for HUD rendering.
     */
    getHUDStats(): {
        timeElapsedMs: number;
        bricksActive: number;
        spawned: number;
        cleared: number;
        dropped: number;
        points: number;
        focusBrickId: string | null;
        focusBrickValue: number | null;
    };
    getFocusState(): {
        enabled: boolean;
        activeBrickId: null;
        spotlightPadding?: undefined;
        dimAlpha?: undefined;
        ammoLabel?: undefined;
    } | {
        enabled: boolean;
        activeBrickId: string | null;
        spotlightPadding: number;
        dimAlpha: number;
        ammoLabel: string | null;
    };
    /**
     * Returns serializable data for persistent storage.
     */
    exportData(): {
        stats: {
            spawned: number;
            cleared: number;
            dropped: number;
            clickErrors: number;
            points: number;
        };
        events: GameEvent[];
    };
    /**
     * Cleans up any remaining bricks (used when the trial ends abruptly).
     */
    forceEnd(): void;
    consumeDroppedVisuals(): Record<string, unknown>[];
    consumeClearedVisuals(): Record<string, unknown>[];
}
export { BRICK_STATUS };
