import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runJsPsychTimeline, configureAutoResponder, resolveAutoResponderProfile } from "./autoresponder";

describe("runJsPsychTimeline blocking", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
      return;
    }
    (globalThis as any).window = originalWindow;
  });

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
    expect(mockJsPsych.simulate).toHaveBeenCalledWith(expect.anything(), "visual", expect.anything());
  });

  it("throws if jsPsych instance is invalid", async () => {
    await expect(runJsPsychTimeline({}, [])).rejects.toThrow("Invalid jsPsych instance");
  });

  it("enables autoresponder from JATOS query parameters when URL search has no auto flag", () => {
    (globalThis as any).window = {
      location: { search: "" },
      jatos: {
        urlQueryParameters: {
          auto: "true",
        },
      },
    };

    const profile = resolveAutoResponderProfile({
      coreConfig: { selection: { taskId: "nback", variantId: "annikaHons" } },
      taskConfig: {},
      selection: {
        platform: "jatos",
        taskId: "nback",
        variantId: "annikaHons",
        participant: { participantId: "p1", studyId: "s1", sessionId: "ss1", sonaId: null },
        source: { task: "jatos", variant: "jatos" },
      },
    });

    expect(profile.enabled).toBe(true);
    expect(profile.jsPsychSimulationMode).toBe("visual");
  });

  it("uses auto_mode from URL/JATOS query parameters", () => {
    (globalThis as any).window = {
      location: { search: "" },
      jatos: {
        urlQueryParameters: {
          auto: "true",
          auto_mode: "data-only",
        },
      },
    };

    const profile = resolveAutoResponderProfile({
      coreConfig: {
        selection: { taskId: "nback", variantId: "annikaHons" },
        autoresponder: { jsPsychSimulationMode: "visual" },
      },
      taskConfig: {},
      selection: {
        platform: "jatos",
        taskId: "nback",
        variantId: "annikaHons",
        participant: { participantId: "p1", studyId: "s1", sessionId: "ss1", sonaId: null },
        source: { task: "jatos", variant: "jatos" },
      },
    });

    expect(profile.enabled).toBe(true);
    expect(profile.jsPsychSimulationMode).toBe("data-only");
  });
});
