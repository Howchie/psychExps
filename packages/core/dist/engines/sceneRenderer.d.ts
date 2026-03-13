import type { SceneStimulus } from "./scene";
import type { Point } from "../infrastructure/spatial";
export declare class SceneRenderer {
    private canvas;
    private ctx;
    constructor(canvas: HTMLCanvasElement);
    /**
     * Renders the scene into the provided slots.
     */
    render(scene: SceneStimulus, slots: Point[], options?: {
        clear?: boolean;
    }): void;
    private renderItem;
    private renderShape;
}
