import * as PIXI from 'pixi.js';
/**
 * ConveyorRenderer
 * -----------------
 * Responsible for all drawing and pointer interactions using PixiJS.
 * - Draws belts, animated bricks, optional visual DRT indicator, and HUD text.
 * - Exposes onBrickClick callback so higher-level logic controls game state.
 *
 * Notes on PixiJS v7 API:
 * - In v7 the Application constructor accepts options directly. We keep the init
 *   routine synchronous to avoid compatibility issues with older sub-versions.
 * - The canvas element can live on `app.view` or `app.canvas`, so we handle both
 *   cases before appending to the DOM.
 */
/**
 * PixiJS renderer responsible for drawing conveyors, bricks, HUD, and optional
 * visual DRT stimuli. Audio DRT is handled by the jsPsych plugin directly.
 */
export declare class ConveyorRenderer {
    config: Record<string, any>;
    onBrickClick: (brickId: string, x: number | null, y: number | null) => void;
    onBrickHold: (brickId: string, durationMs: number, x: number | null, y: number | null) => void;
    onBrickHover: (brickId: string, hovering: boolean, x: number | null, y: number | null) => void;
    onPointerDebug: (payload: Record<string, any>) => void;
    runtimeLengths: number[] | null;
    app: PIXI.Application | null;
    root: HTMLElement | null;
    brickSprites: Map<string, any>;
    hudElements: Record<string, any>;
    hudBackground: PIXI.Graphics | null;
    hudPointsAdornment: PIXI.Graphics | null;
    _lastHudText: string;
    _lastHudPanelSignature: string;
    _lastHudPointsAdornmentSignature: string;
    drtGraphics: PIXI.Graphics | null;
    backgroundTexture: PIXI.Texture | null;
    backgroundTextureOwned: boolean;
    backgroundVisual: PIXI.TilingSprite | null;
    beltTexture: PIXI.Texture | null;
    beltTextureOwned: boolean;
    beltVisuals: Array<Record<string, any>>;
    interactionLayer: PIXI.Container | null;
    conveyorZones: Map<string, PIXI.Graphics>;
    bricksByConveyor: Map<string, any[]>;
    conveyorHoldStart: Map<string, {
        brickId: string;
        t: number;
    }>;
    conveyorHovered: Set<string>;
    conveyorHoverTarget: Map<string, string>;
    conveyorPointerPos: Map<string, {
        x: number | null;
        y: number | null;
    }>;
    spotlightZone: PIXI.Graphics | null;
    spotlightHoldStart: {
        brickId: string;
        t: number;
    } | null;
    spotlightHoveredBrickId: string | null;
    spotlightPointerPos: {
        x: number | null;
        y: number | null;
    };
    spotlightPointerInside: boolean;
    effectVisuals: Array<Record<string, any>>;
    dueMarkerAnchors: Map<string, {
        x: number;
        y: number;
        width: number;
        height: number;
    }>;
    furnaceAnchors: Map<string, {
        mouthX: number;
        mouthY: number;
        mouthWidth: number;
        mouthHeight: number;
    }>;
    furnaceVisuals: Map<string, Record<string, any>>;
    furnaceFlickerTimeMs: number;
    spotlightGraphics: PIXI.Graphics | null;
    spotlightRing: PIXI.Graphics | null;
    spotlightRect: {
        x: number;
        y: number;
        w: number;
        h: number;
    } | null;
    activeBrickId: string | null;
    brickHoldStart: Map<string, {
        t: number;
        x: number;
        y: number;
    }>;
    canvasView: any;
    pointerInCanvas: boolean;
    pointerCanvasPos: {
        x: number | null;
        y: number | null;
    };
    _teardownCanvasPointerTracking: (() => void) | null;
    _brickHoveredId: string | null;
    pointerDebugEnabled: boolean;
    pointerDebugLines: string[];
    pointerDebugText: PIXI.Text | null;
    pointerDebugSeq: number;
    pixelSnapBricks: boolean;
    _spriteSyncEpoch: number;
    _lastSpotlightSignature: string;
    perfStats: {
        effectDropsSkipped: number;
        effectsDestroyed: number;
        clearEffectsQueued: number;
        peakActiveEffects: number;
        peakBrickSprites: number;
    };
    seed: number;
    _rngState: number;
    beltLayer: PIXI.Container;
    backgroundLayer: PIXI.Container;
    brickLayer: PIXI.Container;
    effectLayer: PIXI.Container;
    spotlightLayer: PIXI.Container;
    hudLayer: PIXI.Container;
    drtLayer: PIXI.Container;
    constructor(config: Record<string, any>, { onBrickClick, onBrickHold, onBrickHover, onPointerDebug, runtimeLengths, seed }?: Record<string, any>);
    _nextRand(): number;
    init(container: HTMLElement): Promise<void>;
    _setupPointerDebug(): void;
    _emitPointerDebug(type: string, brickId: string | null, e: any, extra?: Record<string, any>): void;
    _updatePointerDebugOverlay(): void;
    _resolveBeltProceduralStyleConfig(texCfg: Record<string, any>): any;
    _resolveWarehouseProceduralStyleConfig(texCfg: Record<string, any>): any;
    _prepareBeltTexture(): Promise<void>;
    _buildProceduralTopdownBeltTexture(styleCfg?: Record<string, any>): PIXI.RenderTexture | null;
    _drawProceduralTopdownBeltGraphics(target: PIXI.Graphics, { beltLength, beltHeight, phaseX, styleCfg, styleScaleX, styleScaleY }?: Record<string, any>): void;
    _buildProceduralWarehouseTexture(styleCfg?: Record<string, any>): PIXI.RenderTexture | null;
    _drawBelts(): void;
    _isInteractionToggleEnabled(setting: any): boolean;
    _getInteractionTargetMode(): "conveyor" | "spotlight" | "brick";
    _isConveyorHitAreaEnabled(): boolean;
    _isSpotlightHitAreaEnabled(): boolean;
    _resolveSpotlightSnapMode(): "none" | "screen" | "pixel";
    _snapSpotlightGeometry(value: number, mode: string): number;
    _quantizeSpotlightSignature(value: number, step: number): string;
    _extractPointerPosition(e: any): {
        x: any;
        y: any;
    };
    _bindCanvasPointerTracking(view: any): void;
    _getTrackedPointerPosition(): {
        x: number;
        y: number;
    } | null;
    _setCanvasCursor(cursor: string): void;
    _pickInteractiveBrickAtPoint(x: number, y: number): any;
    _clearBrickHoverState(pos?: {
        x: number | null;
        y: number | null;
    } | null): void;
    _reconcileStationaryPointerInteractions(completionMode: string): void;
    _getConveyorTargetBrickId(conveyorId: string): any;
    _syncSpotlightHoverTarget(completionMode: string): void;
    _clearSpotlightZoneInteraction(): void;
    _teardownSpotlightZone(): void;
    _ensureSpotlightZone(holeX: number, holeY: number, holeW: number, holeH: number, cornerRadius: number): void;
    _drawConveyorZone(conveyorId: string, beltY: number, beltLength: number, beltHeight: number): void;
    _drawEndFurnace(conveyorId: string, beltY: number, beltHeight: number, beltLength: number): void;
    /**
     * Scrolls belt textures to suggest motion matching each conveyor's speed.
     * Expects the same ordering as created in _drawBelts.
     */
    updateBelts(conveyors: any[], dtMs: number): void;
    updateFurnaces(dtMs: number): void;
    clampFrameDelta(dtMs: number): number;
    updateBackground(dtMs: number): void;
    _resolveClearAnimationConfig(): {
        enable: boolean;
        timeoutMs: number;
        risePx: number;
        startOffsetYPx: number;
        textColor: any;
        textStrokeColor: any;
        textStrokeThickness: number;
        textFontFamily: string;
        textFontWeight: string;
        textMinSizePx: number;
        textMaxSizePx: number;
        textSizeFactor: number;
        textShadowColor: any;
        textShadowBlur: number;
        textShadowDistance: number;
        coin: {
            enable: boolean;
            showInPointsAnimation: boolean;
            showInHud: boolean;
            sizePx: number;
            gapPx: number;
            rimColor: any;
            bodyColor: any;
            shineColor: any;
            shadowColor: any;
            symbolColor: any;
            ridgeCount: number;
        };
    };
    _seedFromValue(input: any, fallback?: number): number;
    _drawCoinPrimitive(target: PIXI.Graphics, sizePx: number, coinCfg: Record<string, any>, seed?: number): void;
    _resolveHudCoinSize(text: any, uiCfg: Record<string, any>, clearCfg: Record<string, any>): number;
    queueClearEffects(clearEvents?: any[]): void;
    queueDropEffects(dropEvents?: any[]): void;
    updateEffects(dtMs: number): void;
    _setupHUD(): void;
    /**
     * Synchronises PIXI sprites with the logical bricks iterable.
     */
    syncBricks(bricks: Iterable<any>, completionMode: string, completionParams: any, focusState?: any): void;
    _resetBrickVisualChildren(sprite: any): void;
    _drawBrickBody(target: PIXI.Graphics, { brick, shape, width, height, cornerRadius, fillColor, fillAlpha, borderColor, borderAlpha, borderWidth, withTextureOverlay, }: {
        brick: any;
        shape: string;
        width: number;
        height: number;
        cornerRadius: number;
        fillColor: number;
        fillAlpha?: number;
        borderColor: number;
        borderAlpha?: number;
        borderWidth?: number;
        withTextureOverlay?: boolean;
    }): void;
    _shouldUseProgressMask(shape: string, completionMode: string): boolean;
    _createBrickSprite(brick: any): any;
    _drawBrickGraphics(sprite: any, brick: any, completionMode: string): void;
    _updateBrickProgressVisual(sprite: any, brick: any, completionMode: string): void;
    _resolveBrickTextureOverlayConfig(brick: any): any;
    _drawTextureLabelPatch(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, cfg: Record<string, any>): void;
    _drawTextureBandAndPlate(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, cfg: Record<string, any>): void;
    _drawTexturePizza(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, phase: number, idNum: number, cfg: Record<string, any>): void;
    _drawTextureGiftWrap(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, seamColor: number, seamWidth: number, cfg: Record<string, any>): void;
    _drawTextureCheckerboard(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, phase: number, topSheenAlpha: number, highlightColor: number, radius: number, cfg: Record<string, any>): void;
    _drawTextureCardboardBlock(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, idNum: number, cfg: Record<string, any>): void;
    _drawTextureWoodPlanks(target: PIXI.Graphics, w: number, h: number, inset: number, alphaBase: number, phase: number, topSheenAlpha: number, highlightColor: number, radius: number, seamColor: number, seamWidth: number, plankCount: number, grainCount: number, nailRadius: number, cfg: Record<string, any>): void;
    _drawBrickTextureOverlay(target: PIXI.Graphics, brick: any, shape: string, width: number, height: number, cornerRadius: number, fillAlpha?: number): void;
    _drawBrickPrimitive(sprite: PIXI.Graphics, shape: string, width: number, height: number, cornerRadius: number): void;
    _buildBrickHitArea(shape: string, width: number, height: number): PIXI.Rectangle | PIXI.Polygon | PIXI.Ellipse;
    _updateSpotlight(focusState: any): void;
    _updateHudPointsAdornment(lines: any[], text: any, uiCfg: Record<string, any>, clearCfg?: Record<string, any> | null, layout?: Record<string, any> | null): void;
    updateHUD(stats: any, remainingMs: any, blockInfo: any): void;
    /**
     * Shows or hides the visual DRT indicator.
     */
    toggleVisualDRT(show: any, config: any): void;
    _prepareBackgroundTexture(): Promise<void>;
    _drawBackground(): void;
    destroy(): void;
    getPerformanceSnapshot(): {
        activeEffects: number;
        activeBrickSprites: number;
        effectDropsSkipped: number;
        effectsDestroyed: number;
        clearEffectsQueued: number;
        peakActiveEffects: number;
        peakBrickSprites: number;
    };
}
