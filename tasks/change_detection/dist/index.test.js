/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { changeDetectionAdapter } from "./index";
import { createVariableResolver } from "@experiments/core";
describe("ChangeDetectionTaskAdapter", () => {
    it("should initialize correctly", async () => {
        const context = {
            container: document.createElement("div"),
            selection: {
                participant: { participantId: "p1", sessionId: "s1" },
                variantId: "default",
            },
            taskConfig: {
                plan: {
                    blocks: [{ trials: 10, changeProbability: 0.5, setSizes: [4] }]
                }
            },
            resolver: createVariableResolver({ variables: {} })
        };
        await changeDetectionAdapter.initialize(context);
        expect(changeDetectionAdapter.context).toBe(context);
    });
});
//# sourceMappingURL=index.test.js.map