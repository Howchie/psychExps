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

## 2025-03-16 - O(1) Index Cursor over Array Mutation in Loops
**Learning:** Found a bottleneck in `buildScheduledItems` within `packages/core/src/infrastructure/scheduler.ts` where `pool.shift()` was used inside a loop to draw items for a schedule. Since `shift()` modifies the array and requires O(N) memory shifts for every drawn element, it caused significant slowdowns as the loop scaled.
**Action:** Replace destructive array modifications (`shift()`) with an O(1) index cursor variable when iterating over an array pool multiple times. This optimization avoids all intermediate array memory allocations and shifting, improving the execution speed of `buildScheduledItems` by ~30-45%.

## 2025-03-16 - Consolidating chained array iterations in mathematical routines
**Learning:** Found a hot path in `packages/core/src/engines/parameterTransforms.ts` (`fitWaldAnalytic`) where an array of length N was traversed multiple times through `map`, `filter`, and multiple `reduce` calls to compute intermediate values (n, s1, sInv). Because this runs many times in a loop over ~1000 items, the overhead of creating intermediate arrays and performing 4 independent O(N) passes was significant (~630ms in benchmarks). Collapsing this into a single `for` loop eliminated all array allocations and reduced execution time by ~15-20x to ~35ms.
**Action:** In high-frequency, performance-sensitive mathematical loops, avoid chaining `.map()`, `.filter()`, and `.reduce()`. Instead, use a standard `for` loop to accumulate multiple variables simultaneously in a single O(N) pass, completely eliminating intermediate array allocations.

## 2024-04-10 - [Optimization: Hoist trial-filtering condition pre-processing]
**Learning:** In `packages/core/src/runtime/blockSummary.ts`, `computeBlockSummaryStats` iterated over `Object.entries(where)` and created throwaway `Array`s on every loop iteration to filter a potentially very large array of `trialResults`. When the result sets are large, this redundant mapping and object-entry instantiation caused a significant performance bottleneck (almost 3.5x slower).
**Action:** When working with nested array-filtering methods on potentially large data items (like trial summaries), always hoist constant data transformations, dictionary enumerations, and lookup configurations out of the `filter` block. Pre-evaluating conditions into efficient lookup formats like `Array<[string, Set]>` saves redundant object allocations per iteration.
## 2026-03-19 - Consolidating chained array iterations
**Learning:** Found several utility methods across `coerce.ts`, `surveys.ts`, `stimulusInjector.ts`, and `prospectiveMemory.ts` chaining `.map().filter().map()` or `.map().filter().reduce()`. Chained array methods allocate a new intermediate array at every step, which creates unnecessary memory allocations and garbage collection overhead, particularly for loops that run frequently on arrays of data.
**Action:** Replace chained array operations with a single `for` loop to significantly reduce intermediate array memory allocations and increase overall execution speed.
## 2026-04-13 - [Consolidating Chained Array Operations in `stimulusInjector.ts`]
**Learning:** Found an inefficient `.map().filter().map()` chain in `packages/core/src/engines/stimulusInjector.ts` when building `eligibleIndices`. Because `trials` can be large, this chain created three intermediate arrays per execution, causing unnecessary garbage collection overhead and iterating over the array multiple times.
**Action:** Replaced the chained array operations with a single `for` loop to eliminate all intermediate array allocations and reduce iterations from 3 to 1.
