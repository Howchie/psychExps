import { createVariableResolver } from "../packages/core/src/infrastructure/variables";

const resolver = createVariableResolver({
  variables: {
    v1: "$var.v2",
    v2: "$var.v3",
    v3: "$var.v4",
    v4: "$var.v5",
    v5: "final",
  },
});

const start = performance.now();
for (let i = 0; i < 100000; i++) {
  resolver.resolveVar("v1");
}
const end = performance.now();
console.log(`100k deep resolutions: ${end - start}ms`);
