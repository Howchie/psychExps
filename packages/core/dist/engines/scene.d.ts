export interface SceneItem {
    id: string;
    category: string;
    features: Record<string, unknown>;
}
export interface SceneStimulus {
    items: SceneItem[];
}
export interface SceneDiff {
    changedIndices: number[];
    isChanged: boolean;
}
/**
 * Creates a scene from a list of items.
 */
export declare function createScene(items: SceneItem[]): SceneStimulus;
/**
 * Compares two scenes and returns the indices of items that have changed (by ID).
 * Assumes items are in the same spatial slots (order matches).
 */
export declare function diffScenes(s1: SceneStimulus, s2: SceneStimulus): SceneDiff;
