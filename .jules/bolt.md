## 2024-05-18 - [Optimizing Array allocations]
**Learning:** Found and replaced an `Array.from(new Set([...array1, ...array2]))` operation. Building sets dynamically inside a `for` loop prevents O(N) array allocation operations and improves array manipulations in TS significantly in NodeJS environments, going from ~3812ns -> ~1304ns locally (~3x improvement).
**Action:** Prefer `for...of` loops over intermediate array allocations like `[...array]`, `map` and `filter` when constructing Sets from elements in arrays.
## 2024-03-24 - [Avoid swap-and-pop if sequence relies on array element relative order]
**Learning:** Using swap-and-pop to remove an element in O(1) time destroys the array's relative ordering. If subsequent operations rely on searching the array sequentially from the start (e.g., `findIndex`), swapping the last element into the deleted position will alter which elements are found first in later iterations, breaking determinism.
**Action:** When evaluating O(N) array deletions in loops like `splice()`, check if the relative ordering matters for the algorithm's correctness before switching to swap-and-pop.

## 2024-03-24 - [Be careful with for...in vs Object.keys() when extracting column headers]
**Learning:** Switching from `Object.keys()` to a `for...in` loop to avoid intermediate array allocations can be unsafe if it inadvertently includes inherited properties from the object prototype chain, introducing bugs when serializing records (e.g., CSV).
**Action:** Stick to `Object.keys()` or ensure `hasOwnProperty` is checked when replacing property extractions to avoid bugs.
## 2025-03-16 - O(1) Array Removal in buildConditionSequence
**Learning:** Found a performance bottleneck in `packages/core/src/engines/conditions.ts` where `Array.prototype.splice` was used in a loop to remove an element from a random pool of items (`buildCandidatePool`). For large trial counts or multiple condition factors, `splice` runs in O(n) time and shifts elements array memory, leading to slower execution times. This is especially problematic if trials count goes up.
**Action:** Replace `splice` with an O(1) swap-and-pop technique for arrays where order doesn't matter (since items are drawn randomly from the `pool`). This can reduce trial sequence generation from ~425ms to ~25ms in benchmarks.
