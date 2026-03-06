/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { runCustomRtTrial } from "./rtTask";

describe("runCustomRtTrial", () => {
  it("should execute a sequence of stages and capture response", async () => {
    const container = document.createElement("div");
    const render1 = vi.fn().mockReturnValue("P1");
    const render2 = vi.fn().mockReturnValue("P2");

    const resultPromise = runCustomRtTrial({
      container,
      stages: [
        { id: "p1", durationMs: 100, render: render1 },
        { id: "p2", durationMs: 100, render: render2 },
      ],
      response: {
        allowedKeys: ["a"],
        startMs: 50,
        endMs: 200,
      },
    });

    // Simulate key press at 150ms
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    }, 150);

    const result = await resultPromise;

    expect(result.key).toBe("a");
    expect(result.rtMs).toBeGreaterThanOrEqual(150);
    expect(render1).toHaveBeenCalled();
    expect(render2).toHaveBeenCalled();
  });
});
