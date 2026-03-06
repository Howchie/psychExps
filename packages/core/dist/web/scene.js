/**
 * Creates a scene from a list of items.
 */
export function createScene(items) {
    return { items: [...items] };
}
/**
 * Compares two scenes and returns the indices of items that have changed (by ID).
 * Assumes items are in the same spatial slots (order matches).
 */
export function diffScenes(s1, s2) {
    if (s1.items.length !== s2.items.length) {
        throw new Error(`Scenes must have the same number of items to be diffed (found ${s1.items.length} vs ${s2.items.length}).`);
    }
    const changedIndices = [];
    for (let i = 0; i < s1.items.length; i++) {
        if (s1.items[i].id !== s2.items[i].id) {
            changedIndices.push(i);
        }
    }
    return {
        changedIndices,
        isChanged: changedIndices.length > 0,
    };
}
//# sourceMappingURL=scene.js.map