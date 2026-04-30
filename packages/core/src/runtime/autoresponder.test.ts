import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runJsPsychTimeline,
  configureAutoResponder,
  resolveAutoResponderProfile,
  sampleAutoInteger,
  sampleAutoSurveySubmitDelayMs,
} from "./autoresponder";

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
      coreConfig: { selection: { taskId: "nback" } },
      taskConfig: {},
      selection: {
        platform: "jatos",
        taskId: "nback",
        configPath: "nback/annikaHons",
        participant: { participantId: "p1", studyId: "s1", sessionId: "ss1", sonaId: null },
        source: { task: "jatos" },
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
        selection: { taskId: "nback" },
        autoresponder: { jsPsychSimulationMode: "visual" },
      },
      taskConfig: {},
      selection: {
        platform: "jatos",
        taskId: "nback",
        configPath: "nback/annikaHons",
        participant: { participantId: "p1", studyId: "s1", sessionId: "ss1", sonaId: null },
        source: { task: "jatos" },
      },
    });

    expect(profile.enabled).toBe(true);
    expect(profile.jsPsychSimulationMode).toBe("data-only");
  });

  it("resolves and samples survey submit delay from autoresponder profile", () => {
    (globalThis as any).window = {
      location: { search: "", assign: () => {}, replace: () => {} },
    };
    const profile = resolveAutoResponderProfile({
      coreConfig: {
        selection: { taskId: "bricks" },
        autoresponder: {
          enabled: true,
          surveySubmitDelayMs: { minMs: 25, maxMs: 35 },
        },
      },
      taskConfig: {},
      selection: {
        platform: "local",
        taskId: "bricks",
        configPath: "bricks/evanderHons",
        participant: { participantId: "p1", studyId: "s1", sessionId: "ss1", sonaId: null },
        source: { task: "default" },
      },
    });

    configureAutoResponder(profile);
    const sample = sampleAutoSurveySubmitDelayMs();
    expect(sample).not.toBeNull();
    expect(sample as number).toBeGreaterThanOrEqual(25);
    expect(sample as number).toBeLessThanOrEqual(35);
  });

  it("samples bounded integers for survey randomization", () => {
    configureAutoResponder({
      enabled: true,
      seed: "test",
      jsPsychSimulationMode: "visual",
      continueDelayMs: { minMs: 0, maxMs: 0 },
      surveySubmitDelayMs: { minMs: 0, maxMs: 0 },
      responseRtMs: { meanMs: 10, sdMs: 1, minMs: 1, maxMs: 20 },
      timeoutRate: 0,
      errorRate: 0,
      interActionDelayMs: { minMs: 0, maxMs: 0 },
      holdDurationMs: { minMs: 0, maxMs: 0 },
      maxTrialDurationMs: 1000,
    } as any);

    const values = Array.from({ length: 20 }, () => sampleAutoInteger(0, 4));
    expect(values.every((value) => value !== null && value >= 0 && value <= 4)).toBe(true);
  });
});
