## 2024-03-24 - [Avoid swap-and-pop if sequence relies on array element relative order]
**Learning:** Using swap-and-pop to remove an element in O(1) time destroys the array's relative ordering. If subsequent operations rely on searching the array sequentially from the start (e.g., `findIndex`), swapping the last element into the deleted position will alter which elements are found first in later iterations, breaking determinism.
**Action:** When evaluating O(N) array deletions in loops like `splice()`, check if the relative ordering matters for the algorithm's correctness before switching to swap-and-pop.

## 2024-03-24 - [Be careful with for...in vs Object.keys() when extracting column headers]
**Learning:** Switching from `Object.keys()` to a `for...in` loop to avoid intermediate array allocations can be unsafe if it inadvertently includes inherited properties from the object prototype chain, introducing bugs when serializing records (e.g., CSV).
**Action:** Stick to `Object.keys()` or ensure `hasOwnProperty` is checked when replacing property extractions to avoid bugs.
