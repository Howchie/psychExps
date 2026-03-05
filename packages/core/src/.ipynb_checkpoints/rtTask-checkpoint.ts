import { normalizeKey } from "./ui";
import { runTrialTimeline, type TrialTimelineResult } from "./trial";

export interface RtTiming {
  trialDurationMs: number;
  fixationDurationMs: number;
  stimulusOnsetMs: number;
  responseWindowStartMs: number;
  responseWindowEndMs: number;
}

export interface RtPhaseDurations {
  trialDurationMs: number;
  fixationMs: number;
  blankMs: number;
  preResponseStimulusMs: number;
  responseMs: number;
  postResponseStimulusMs: number;
  responseStartMs: number;
  responseEndMs: number;
  stimulusStartMs: number;
}

export interface RtPhaseOptions {
  responseTerminatesTrial?: boolean;
}

export interface RunBasicRtTrialArgs {
  container: HTMLElement;
  timing: RtTiming;
  allowedKeys: string[];
  renderFixation?: () => void | string;
  renderBlank?: () => void | string;
  renderStimulus: () => void | string;
  responseTerminatesTrial?: boolean;
}

export interface BasicRtTrialResult {
  key: string | null;
  rtMs: number | null;
  timings: RtPhaseDurations;
  timeline: TrialTimelineResult;
}

const toNonNegative = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(0, fallback);
  return Math.max(0, numeric);
};

const toPositive = (value: unknown, fallback = 1): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(1, fallback);
  return numeric;
};

export function computeRtPhaseDurations(timing: RtTiming, options: RtPhaseOptions = {}): RtPhaseDurations {
  const trialDurationMs = toPositive(timing.trialDurationMs, 5000);
  const fixationEnd = Math.min(trialDurationMs, toNonNegative(timing.fixationDurationMs, 500));
  const stimulusStartMs = Math.min(trialDurationMs, toNonNegative(timing.stimulusOnsetMs, 1000));
  const responseStartMs = Math.min(trialDurationMs, toNonNegative(timing.responseWindowStartMs, stimulusStartMs));
  const responseEndMs = Math.max(
    responseStartMs,
    Math.min(trialDurationMs, toNonNegative(timing.responseWindowEndMs, trialDurationMs)),
  );

  const fixationMs = fixationEnd;
  const blankMs = Math.max(0, stimulusStartMs - fixationEnd);
  const preResponseStimulusMs = Math.max(0, responseStartMs - stimulusStartMs);
  const responseMs = Math.max(0, responseEndMs - responseStartMs);
  const postResponseStimulusMs = options.responseTerminatesTrial
    ? 0
    : Math.max(0, trialDurationMs - responseEndMs);

  return {
    trialDurationMs,
    fixationMs,
    blankMs,
    preResponseStimulusMs,
    responseMs,
    postResponseStimulusMs,
    responseStartMs,
    responseEndMs,
    stimulusStartMs,
  };
}

export async function runBasicRtTrial(args: RunBasicRtTrialArgs): Promise<BasicRtTrialResult> {
  const timings = computeRtPhaseDurations(args.timing, {
    responseTerminatesTrial: args.responseTerminatesTrial,
  });
  const timeline = await runTrialTimeline({
    container: args.container,
    stages: [
      {
        id: "fixation",
        durationMs: timings.fixationMs,
        render: args.renderFixation,
      },
      {
        id: "blank",
        durationMs: timings.blankMs,
        render: args.renderBlank,
      },
      {
        id: "stimulus",
        durationMs:
          timings.preResponseStimulusMs + timings.responseMs + timings.postResponseStimulusMs,
        render: args.renderStimulus,
      },
    ],
    response: {
      allowedKeys: (args.allowedKeys ?? []).map((entry) => normalizeKey(entry)).filter(Boolean),
      startMs: timings.responseStartMs,
      endMs: timings.responseEndMs,
    },
  });

  return {
    key: timeline.key ? normalizeKey(timeline.key) : null,
    rtMs: timeline.rtMs,
    timings,
    timeline,
  };
}
