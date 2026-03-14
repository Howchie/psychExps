import { describe, it, expect, vi, beforeEach } from "vitest";
import { runJsPsychTimeline, configureAutoResponder } from "./autoresponder";

describe("runJsPsychTimeline blocking", () => {
  beforeEach(() => {
    // Disable autoresponder by default for these tests
    configureAutoResponder({ enabled: false } as any);
  });

  it("blocks until jsPsych.run promise resolves in live mode", async () => {
    let resolved = false;
    const mockJsPsych = {
      run: vi.fn().mockImplementation(() => {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            resolved = true;
            resolve();
          }, 50);
        });
      }),
    };

    const runPromise = runJsPsychTimeline(mockJsPsych, []);
    expect(resolved).toBe(false);
    await runPromise;
    expect(resolved).toBe(true);
    expect(mockJsPsych.run).toHaveBeenCalled();
  });

  it("blocks until jsPsych.simulate finishes in auto mode", async () => {
    configureAutoResponder({ enabled: true, seed: "test" } as any);
    
    let finished = false;
    const mockJsPsych = {
      simulate: vi.fn().mockImplementation((timeline, mode, options) => {
        // Simulate jsPsych behavior where it calls on_finish after some time
        // but the simulate call itself might return a promise immediately
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            finished = true;
            options.on_finish?.();
            resolve();
          }, 50);
        });
      }),
    };

    const runPromise = runJsPsychTimeline(mockJsPsych, []);
    expect(finished).toBe(false);
    await runPromise;
    expect(finished).toBe(true);
    expect(mockJsPsych.simulate).toHaveBeenCalledWith(expect.anything(), "data-only", expect.anything());
  });

  it("throws if jsPsych instance is invalid", async () => {
    await expect(runJsPsychTimeline({}, [])).rejects.toThrow("Invalid jsPsych instance");
  });
});
