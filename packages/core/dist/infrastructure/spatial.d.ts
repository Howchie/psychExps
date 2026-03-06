import type { SeededRandom } from "./random";
export interface Point {
    x: number;
    y: number;
}
export interface Size {
    width: number;
    height: number;
}
export interface Rect extends Point, Size {
}
export type SpatialTemplate = "circular" | "grid" | "random";
export interface GenerateSlotsArgs {
    template: SpatialTemplate;
    count: number;
    radius?: number;
    centerX?: number;
    centerY?: number;
    startAngle?: number;
    cols?: number;
    spacingX?: number;
    spacingY?: number;
    bounds?: Size;
    slotSize?: Size;
    padding?: number;
    maxAttempts?: number;
    rng?: SeededRandom;
}
export declare class SpatialLayoutManager {
    /**
     * Generates a set of slot positions based on a template.
     */
    generateSlots(args: GenerateSlotsArgs): Point[];
    private generateCircularSlots;
    private generateGridSlots;
    private generateRandomSlots;
}
