import { normalizeKey } from "./ui";
import { runTrialTimeline, type TrialTimelineResult } from "./trial";

export interface RtTiming {
  trialDurationMs: number;
  fixationOnsetMs?: number;
  fixationDurationMs: number;
  stimulusOnsetMs: number;
  stimulusDurationMs?: number | null;
  responseWindowStartMs: number;
  responseWindowEndMs: number;
}

export interface RtPhaseDurations {
  trialDurationMs: number;
  fixationMs: number;
  blankMs: number;
  preResponseStimulusMs: number;
  responsePreStimulusBlankMs: number;
  responseStimulusMs: number;
  responsePostStimulusBlankMs: number;
  responseBlankMs: number;
  responseMs: number;
  postResponseStimulusMs: number;
  postResponseBlankMs: number;
  preFixationBlankMs: number;
  responseStartMs: number;
  responseEndMs: number;
  stimulusStartMs: number;
  stimulusEndMs: number;
  fixationStartMs: number;
  fixationEndMs: number;
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
  const fixationStart = Math.min(trialDurationMs, toNonNegative(timing.fixationOnsetMs, 0));
  const fixationEnd = Math.min(trialDurationMs, fixationStart + toNonNegative(timing.fixationDurationMs, 500));
  const stimulusStartMs = Math.min(trialDurationMs, toNonNegative(timing.stimulusOnsetMs, 1000));
  const stimulusDurationRaw = timing.stimulusDurationMs;
  const stimulusDurationMs =
    stimulusDurationRaw == null ? null : toNonNegative(stimulusDurationRaw, trialDurationMs - stimulusStartMs);
  const stimulusEndMs = stimulusDurationMs == null
    ? trialDurationMs
    : Math.min(trialDurationMs, stimulusStartMs + stimulusDurationMs);
  const responseStartMs = Math.min(trialDurationMs, toNonNegative(timing.responseWindowStartMs, stimulusStartMs));
  const responseEndMs = Math.max(
    responseStartMs,
    Math.min(trialDurationMs, toNonNegative(timing.responseWindowEndMs, trialDurationMs)),
  );

  const fixationMs = Math.max(0, fixationEnd - fixationStart);
  const preFixationBlankMs = Math.max(0, fixationStart);
  const blankMs = Math.max(0, stimulusStartMs - fixationEnd);
  const preResponseStimulusMs = Math.max(
    0,
    Math.min(responseStartMs, stimulusEndMs) - stimulusStartMs,
  );
  const responseMs = Math.max(0, responseEndMs - responseStartMs);
  const responsePreStimulusBlankMs = Math.max(
    0,
    Math.min(responseEndMs, stimulusStartMs) - responseStartMs,
  );
  const responseStimulusMs = Math.max(
    0,
    Math.min(responseEndMs, stimulusEndMs) - Math.max(responseStartMs, stimulusStartMs),
  );
  const responsePostStimulusBlankMs = Math.max(
    0,
    responseEndMs - Math.max(responseStartMs, stimulusEndMs),
  );
  const responseBlankMs = responsePreStimulusBlankMs + responsePostStimulusBlankMs;

  const rawPostResponseStimulusMs = Math.max(0, Math.min(trialDurationMs, stimulusEndMs) - responseEndMs);
  const rawPostResponseBlankMs = Math.max(0, trialDurationMs - responseEndMs - rawPostResponseStimulusMs);
  const postResponseStimulusMs = options.responseTerminatesTrial ? 0 : rawPostResponseStimulusMs;
  const postResponseBlankMs = options.responseTerminatesTrial ? 0 : rawPostResponseBlankMs;

  return {
    trialDurationMs,
    fixationMs,
    blankMs,
    preResponseStimulusMs,
    responsePreStimulusBlankMs,
    responseStimulusMs,
    responsePostStimulusBlankMs,
    responseBlankMs,
    responseMs,
    postResponseStimulusMs,
    postResponseBlankMs,
    preFixationBlankMs,
    responseStartMs,
    responseEndMs,
    stimulusStartMs,
    stimulusEndMs,
    fixationStartMs: fixationStart,
    fixationEndMs: fixationEnd,
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
        id: "pre_fixation_blank",
        durationMs: timings.preFixationBlankMs,
        render: args.renderBlank,
      },
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
          timings.preResponseStimulusMs + timings.responseStimulusMs + timings.postResponseStimulusMs,
        render: args.renderStimulus,
      },
      {
        id: "post_stimulus_blank",
        durationMs: timings.responseBlankMs + timings.postResponseBlankMs,
        render: args.renderBlank,
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
