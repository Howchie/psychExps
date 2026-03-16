import type { SceneStimulus } from "./scene";
import type { Point } from "../infrastructure/spatial";
export declare class SceneRenderer {
    private canvas;
    private ctx;
    constructor(canvas: HTMLCanvasElement);
    /**
     * Pre-load string-sourced images so they render synchronously.
     * Call before the first render pass to avoid blank frames.
     */
    preloadImages(scene: SceneStimulus): Promise<void>;
    /**
     * Renders the scene into the provided slots.
     */
    render(scene: SceneStimulus, slots: Point[], options?: {
        clear?: boolean;
    }): void;
    private renderItem;
    private renderImage;
    private renderShape;
}
