## 2024-05-18 - [Optimizing Array allocations]
**Learning:** Found and replaced an `Array.from(new Set([...array1, ...array2]))` operation. Building sets dynamically inside a `for` loop prevents O(N) array allocation operations and improves array manipulations in TS significantly in NodeJS environments, going from ~3812ns -> ~1304ns locally (~3x improvement).
**Action:** Prefer `for...of` loops over intermediate array allocations like `[...array]`, `map` and `filter` when constructing Sets from elements in arrays.
