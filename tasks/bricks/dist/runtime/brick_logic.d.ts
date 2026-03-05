/**
 * Hit detection helper for pointer interaction. Coordinates are in canvas space.
 */
export declare const isPointInsideBrick: (brick: any, x: any, y: any) => boolean;
/**
 * Returns the width of the currently visible brick body.
 * The interactive hit area stays full-width, but completion modes with
 * progressive visual depletion shrink the visible mass from the right edge.
 */
export declare const getBrickVisibleWidth: (brick: any, completionMode: any) => number;
/**
 * Returns a PIXI-compatible tint for the given completion progress. The exact
 * visuals are handled in the renderer, but keeping the logic here keeps the
 * renderer clean.
 */
export declare const brickProgressTint: (brick: any, completionMode: any, params?: {}) => number;
