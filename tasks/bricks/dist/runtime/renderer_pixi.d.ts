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
    constructor(config: any, { onBrickClick, onBrickHold, onBrickHover, onPointerDebug, runtimeLengths, seed }?: {});
    _nextRand(): number;
    init(container: any): Promise<void>;
    _setupPointerDebug(): void;
    _emitPointerDebug(type: any, brickId: any, e: any, extra?: {}): void;
    _updatePointerDebugOverlay(): void;
    _resolveBeltProceduralStyleConfig(texCfg: any): any;
    _resolveWarehouseProceduralStyleConfig(texCfg: any): any;
    _prepareBeltTexture(): Promise<void>;
    _buildProceduralTopdownBeltTexture(styleCfg?: {}): any;
    _drawProceduralTopdownBeltGraphics(target: any, { beltLength, beltHeight, phaseX, styleCfg, styleScaleX, styleScaleY }?: {
        phaseX?: number | undefined;
        styleCfg?: {} | undefined;
        styleScaleX?: number | undefined;
        styleScaleY?: number | undefined;
    }): void;
    _buildProceduralWarehouseTexture(styleCfg?: {}): any;
    _drawBelts(): void;
    _isInteractionToggleEnabled(setting: any): boolean;
    _getInteractionTargetMode(): "spotlight" | "conveyor" | "brick";
    _isConveyorHitAreaEnabled(): boolean;
    _isSpotlightHitAreaEnabled(): boolean;
    _resolveSpotlightSnapMode(): "none" | "pixel" | "screen";
    _snapSpotlightGeometry(value: any, mode: any): number;
    _quantizeSpotlightSignature(value: any, step: any): string;
    _extractPointerPosition(e: any): {
        x: any;
        y: any;
    };
    _bindCanvasPointerTracking(view: any): void;
    _getTrackedPointerPosition(): {
        x: number;
        y: number;
    } | null;
    _setCanvasCursor(cursor: any): void;
    _pickInteractiveBrickAtPoint(x: any, y: any): null;
    _clearBrickHoverState(pos?: null): void;
    _reconcileStationaryPointerInteractions(completionMode: any): void;
    _getConveyorTargetBrickId(conveyorId: any): any;
    _syncSpotlightHoverTarget(completionMode: any): void;
    _clearSpotlightZoneInteraction(): void;
    _teardownSpotlightZone(): void;
    _ensureSpotlightZone(holeX: any, holeY: any, holeW: any, holeH: any, cornerRadius: any): void;
    _drawConveyorZone(conveyorId: any, beltY: any, beltLength: any, beltHeight: any): void;
    _drawEndFurnace(conveyorId: any, beltY: any, beltHeight: any, beltLength: any): void;
    /**
     * Scrolls belt textures to suggest motion matching each conveyor's speed.
     * Expects the same ordering as created in _drawBelts.
     */
    updateBelts(conveyors: any, dtMs: any): void;
    updateFurnaces(dtMs: any): void;
    clampFrameDelta(dtMs: any): number;
    updateBackground(dtMs: any): void;
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
    _drawCoinPrimitive(target: any, sizePx: any, coinCfg: any, seed?: number): void;
    _resolveHudCoinSize(text: any, uiCfg: any, clearCfg: any): number;
    queueClearEffects(clearEvents?: never[]): void;
    queueDropEffects(dropEvents?: never[]): void;
    updateEffects(dtMs: any): void;
    _setupHUD(): void;
    /**
     * Synchronises PIXI sprites with the logical bricks array.
     */
    syncBricks(bricks: any, completionMode: any, completionParams: any, focusState?: null): void;
    _resetBrickVisualChildren(sprite: any): void;
    _drawBrickBody(target: any, { brick, shape, width, height, cornerRadius, fillColor, fillAlpha, borderColor, borderAlpha, borderWidth, withTextureOverlay, }: {
        brick: any;
        shape: any;
        width: any;
        height: any;
        cornerRadius: any;
        fillColor: any;
        fillAlpha?: number | undefined;
        borderColor: any;
        borderAlpha?: number | undefined;
        borderWidth?: number | undefined;
        withTextureOverlay?: boolean | undefined;
    }): void;
    _shouldUseProgressMask(shape: any, completionMode: any): boolean;
    _createBrickSprite(brick: any): PIXI.Container<PIXI.DisplayObject>;
    _drawBrickGraphics(sprite: any, brick: any, completionMode: any): void;
    _updateBrickProgressVisual(sprite: any, brick: any, completionMode: any): void;
    _resolveBrickTextureOverlayConfig(brick: any): any;
    _drawTextureLabelPatch(target: any, w: any, h: any, inset: any, alphaBase: any, cfg: any): void;
    _drawTextureBandAndPlate(target: any, w: any, h: any, inset: any, alphaBase: any, cfg: any): void;
    _drawTexturePizza(target: any, w: any, h: any, inset: any, alphaBase: any, phase: any, idNum: any, cfg: any): void;
    _drawTextureGiftWrap(target: any, w: any, h: any, inset: any, alphaBase: any, seamColor: any, seamWidth: any, cfg: any): void;
    _drawTextureCheckerboard(target: any, w: any, h: any, inset: any, alphaBase: any, phase: any, topSheenAlpha: any, highlightColor: any, radius: any, cfg: any): void;
    _drawTextureCardboardBlock(target: any, w: any, h: any, inset: any, alphaBase: any, idNum: any, cfg: any): void;
    _drawTextureWoodPlanks(target: any, w: any, h: any, inset: any, alphaBase: any, phase: any, topSheenAlpha: any, highlightColor: any, radius: any, seamColor: any, seamWidth: any, plankCount: any, grainCount: any, nailRadius: any, cfg: any): void;
    _drawBrickTextureOverlay(target: any, brick: any, shape: any, width: any, height: any, cornerRadius: any, fillAlpha?: number): void;
    _drawBrickPrimitive(sprite: any, shape: any, width: any, height: any, cornerRadius: any): void;
    _buildBrickHitArea(shape: any, width: any, height: any): PIXI.Rectangle | PIXI.Ellipse | PIXI.Polygon;
    _updateSpotlight(focusState: any): void;
    _updateHudPointsAdornment(lines: any, text: any, uiCfg: any, clearCfg?: null, layout?: null): void;
    updateHUD(stats: any, remainingMs: any, blockInfo: any): void;
    /**
     * Shows or hides the visual DRT indicator.
     */
    toggleVisualDRT(show: any, config: any): void;
    _prepareBackgroundTexture(): Promise<void>;
    _drawBackground(): void;
    destroy(): void;
    getPerformanceSnapshot(): any;
}
