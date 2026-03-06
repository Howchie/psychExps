import { normalizeKey } from "../web/ui";
import { runTrialTimeline } from "../web/trial";
const toNonNegative = (value, fallback = 0) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric))
        return Math.max(0, fallback);
    return Math.max(0, numeric);
};
const toPositive = (value, fallback = 1) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0)
        return Math.max(1, fallback);
    return numeric;
};
export function computeRtPhaseDurations(timing, options = {}) {
    const trialDurationMs = toPositive(timing.trialDurationMs, 5000);
    const fixationStart = Math.min(trialDurationMs, toNonNegative(timing.fixationOnsetMs, 0));
    const fixationEnd = Math.min(trialDurationMs, fixationStart + toNonNegative(timing.fixationDurationMs, 500));
    const stimulusStartMs = Math.min(trialDurationMs, toNonNegative(timing.stimulusOnsetMs, 1000));
    const stimulusDurationRaw = timing.stimulusDurationMs;
    const stimulusDurationMs = stimulusDurationRaw == null ? null : toNonNegative(stimulusDurationRaw, trialDurationMs - stimulusStartMs);
    const stimulusEndMs = stimulusDurationMs == null
        ? trialDurationMs
        : Math.min(trialDurationMs, stimulusStartMs + stimulusDurationMs);
    const responseStartMs = Math.min(trialDurationMs, toNonNegative(timing.responseWindowStartMs, stimulusStartMs));
    const responseEndMs = Math.max(responseStartMs, Math.min(trialDurationMs, toNonNegative(timing.responseWindowEndMs, trialDurationMs)));
    const fixationMs = Math.max(0, fixationEnd - fixationStart);
    const preFixationBlankMs = Math.max(0, fixationStart);
    const blankMs = Math.max(0, stimulusStartMs - fixationEnd);
    const preResponseStimulusMs = Math.max(0, Math.min(responseStartMs, stimulusEndMs) - stimulusStartMs);
    const responseMs = Math.max(0, responseEndMs - responseStartMs);
    const responsePreStimulusBlankMs = Math.max(0, Math.min(responseEndMs, stimulusStartMs) - responseStartMs);
    const responseStimulusMs = Math.max(0, Math.min(responseEndMs, stimulusEndMs) - Math.max(responseStartMs, stimulusStartMs));
    const responsePostStimulusBlankMs = Math.max(0, responseEndMs - Math.max(responseStartMs, stimulusEndMs));
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
export async function runCustomRtTrial(args) {
    const timeline = await runTrialTimeline({
        container: args.container,
        stages: args.stages,
        response: {
            allowedKeys: (args.response.allowedKeys ?? []).map((entry) => normalizeKey(entry)).filter(Boolean),
            startMs: args.response.startMs,
            endMs: args.response.endMs,
        },
    });
    return {
        key: timeline.key ? normalizeKey(timeline.key) : null,
        rtMs: timeline.rtMs,
        timeline,
    };
}
export async function runBasicRtTrial(args) {
    const timings = computeRtPhaseDurations(args.timing, {
        responseTerminatesTrial: args.responseTerminatesTrial,
    });
    const result = await runCustomRtTrial({
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
                durationMs: timings.preResponseStimulusMs + timings.responseStimulusMs + timings.postResponseStimulusMs,
                render: args.renderStimulus,
            },
            {
                id: "post_stimulus_blank",
                durationMs: timings.responseBlankMs + timings.postResponseBlankMs,
                render: args.renderBlank,
            },
        ],
        response: {
            allowedKeys: args.allowedKeys,
            startMs: timings.responseStartMs,
            endMs: timings.responseEndMs,
        },
    });
    return {
        key: result.key,
        rtMs: result.rtMs,
        timings,
        timeline: result.timeline,
    };
}
//# sourceMappingURL=rtTask.js.map