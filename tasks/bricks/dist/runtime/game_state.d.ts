declare const BRICK_STATUS: {
    ACTIVE: string;
    CLEARED: string;
    DROPPED: string;
};
/**
 * Represents the trial-level game state, including conveyors, bricks, and
 * high-level statistics. Rendering and jsPsych plugin orchestrate updates
 * via the public methods exposed here.
 */
export declare class GameState {
    constructor(config: any, { onEvent, seed }?: {});
    _log(type: any, payload?: {}): void;
    _initConveyors(): void;
    _initBricks(): void;
    _initForcedBricks(): boolean;
    _materializeForcedSet(): any;
    _generateForcedSetFromPlan(plan: any): any[];
    _createForcedPlanFieldResolver(fieldSpec: any): (index: any) => any;
    _sampleField(spec: any): any;
    _resolveValue(spec: any): number;
    _prepareBrickCategories(): {
        color: ({
            id: any;
            label: any;
            dimension: any;
            traits: any;
        } | null)[];
        width: ({
            id: any;
            label: any;
            dimension: any;
            traits: any;
        } | null)[];
        borderColor: ({
            id: any;
            label: any;
            dimension: any;
            traits: any;
        } | null)[];
        shape: ({
            id: any;
            label: any;
            dimension: any;
            traits: any;
        } | null)[];
        texture: ({
            id: any;
            label: any;
            dimension: any;
            traits: any;
        } | null)[];
    };
    _normalizeBrickShape(rawShape: any): any;
    _isSamplerSpec(value: any): boolean;
    _collectCategoryTraitSpecs(source: any): {};
    _materializeBrickTraits(traitSpecs: any): {};
    _pickRandomCategory(dimension: any): any;
    _resolveCategoryById(dimension: any, id: any): any;
    _resolveCategorySelectionsForEntry(entry: any): {
        color: any;
        width: any;
        borderColor: any;
        shape: any;
        texture: any;
    };
    _resolveBrickTraits({ categories, traits, metadata }?: {
        categories?: null | undefined;
        traits?: null | undefined;
        metadata?: null | undefined;
    }): {
        categories: {
            color: any;
            width: any;
            borderColor: any;
            shape: any;
            texture: any;
        };
        traits: {};
    };
    _makeLengthSampler(lengthSpec: any): () => any;
    _makeInterSpawnSampler(spawnCfg?: {}): () => unknown;
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
    _setForcedActiveBrick(orderIndex: any, reason: any): void;
    _advanceForcedActiveBrick(reason: any): void;
    _scheduleForcedTimedSwitch(): void;
    _computeBrickY(conveyorY: any, brickHeight: any): any;
    /**
     * Spawns a new brick on the given conveyor if safety constraints permit.
     */
    _spawnBrick(conveyor: any, { x, reason, bypassSpacing, categories, traits, metadata }?: {
        x?: number | undefined;
        reason?: string | undefined;
        bypassSpacing?: boolean | undefined;
        categories?: null | undefined;
        traits?: null | undefined;
        metadata?: null | undefined;
    }): boolean;
    handleBrickHover(brickId: any, isHovering: any, timestamp: any, pointerPos?: {}): void;
    /**
     * Removes a brick and updates stats/logging.
     */
    _finalizeBrick(brick: any, status: any, payload?: {}): void;
    _isCurrentForcedBrick(brickId: any): boolean;
    _canWorkOnBrick(brick: any): {
        ok: boolean;
        reason: string;
    } | {
        ok: boolean;
        reason: null;
    };
    /**
     * Handles player interaction depending on completion mode.
     */
    handleBrickInteraction(brickId: any, timestamp: any, clickPos?: {}): void;
    handleBrickHold(brickId: any, holdDurationMs: any, timestamp: any, clickPos?: {}): void;
    /**
     * Advances the simulation by dt milliseconds.
     */
    step(dtMs: any): void;
    /**
     * Returns a lightweight snapshot for HUD rendering.
     */
    getHUDStats(): {
        timeElapsedMs: any;
        bricksActive: any;
        spawned: any;
        cleared: any;
        dropped: any;
        points: any;
        focusBrickId: any;
        focusBrickValue: any;
    };
    getFocusState(): {
        enabled: boolean;
        activeBrickId: null;
        spotlightPadding?: undefined;
        dimAlpha?: undefined;
        ammoLabel?: undefined;
    } | {
        enabled: boolean;
        activeBrickId: any;
        spotlightPadding: any;
        dimAlpha: any;
        ammoLabel: string | null;
    };
    /**
     * Returns serializable data for persistent storage.
     */
    exportData(): {
        stats: any;
        events: any;
    };
    /**
     * Cleans up any remaining bricks (used when the trial ends abruptly).
     */
    forceEnd(): void;
    consumeDroppedVisuals(): any;
}
export { BRICK_STATUS };
