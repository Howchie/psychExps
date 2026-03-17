import { initJsPsych } from "jspsych";
import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";
import { extractJsPsychTrialResponse, setCursorHidden, shouldHideCursorForPhase } from "../web/ui";
import { asObject } from "../utils/coerce";
export function initStandardJsPsych(args) {
    return initJsPsych({
        display_element: args.displayElement,
        on_trial_start: (trial) => {
            const data = asObject(trial?.data);
            setCursorHidden(shouldHideCursorForPhase(data?.phase));
            if (args.onTrialStart)
                args.onTrialStart(trial);
        },
        on_finish: () => {
            setCursorHidden(false);
            if (args.onFinish)
                args.onFinish();
        },
    });
}
export function buildJsPsychRtTimelineNodes(config) {
    const { phasePrefix, responseTerminatesTrial, durations, canvasSize, allowedKeys, baseData, renderFixation, renderBlank, renderStimulus, renderFeedback, feedback, postResponseContent = "stimulus", onResponse, } = config;
    const timeline = [];
    const phaseName = (suffix) => (phasePrefix ? `${phasePrefix}_${suffix}` : suffix);
    if (durations.preFixationBlankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: renderBlank,
            canvas_size: canvasSize,
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: Math.max(0, Math.round(durations.preFixationBlankMs)),
            data: { ...baseData, phase: phaseName("pre_fixation_blank") },
        });
    }
    if (durations.fixationMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: renderFixation,
            canvas_size: canvasSize,
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: Math.max(0, Math.round(durations.fixationMs)),
            data: { ...baseData, phase: phaseName("fixation") },
        });
    }
    if (durations.blankMs > 0) {
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: renderBlank,
            canvas_size: canvasSize,
            choices: "NO_KEYS",
            response_ends_trial: false,
            trial_duration: Math.max(0, Math.round(durations.blankMs)),
            data: { ...baseData, phase: phaseName("blank") },
        });
    }
    const responseSegments = [];
    if (!responseTerminatesTrial) {
        if (durations.responsePreStimulusBlankMs > 0) {
            responseSegments.push({
                phase: phaseName("response_window_pre_stim_blank"),
                durationMs: durations.responsePreStimulusBlankMs,
                showStimulus: false,
            });
        }
        if (durations.responseStimulusMs > 0) {
            responseSegments.push({
                phase: phaseName("response_window_stimulus"),
                durationMs: durations.responseStimulusMs,
                showStimulus: true,
            });
        }
        if (durations.responsePostStimulusBlankMs > 0) {
            responseSegments.push({
                phase: phaseName("response_window_post_stim_blank"),
                durationMs: durations.responsePostStimulusBlankMs,
                showStimulus: false,
            });
        }
    }
    if (responseSegments.length === 0 && durations.responseMs > 0) {
        responseSegments.push({
            phase: phaseName("response_window"),
            durationMs: durations.responseMs,
            showStimulus: true,
        });
    }
    let capturedResponse = { key: null, rtMs: null };
    let responseSeen = false;
    responseSegments.forEach((segment, segmentIndex) => {
        const isLast = segmentIndex === responseSegments.length - 1;
        timeline.push({
            type: CanvasKeyboardResponsePlugin,
            stimulus: segment.showStimulus ? renderStimulus : renderBlank,
            canvas_size: canvasSize,
            choices: allowedKeys,
            response_ends_trial: responseTerminatesTrial,
            trial_duration: Math.max(0, Math.round(segment.durationMs)),
            data: { ...baseData, phase: segment.phase },
            on_finish: (data) => {
                if (!responseSeen) {
                    const response = extractJsPsychTrialResponse(data);
                    if (response.key || response.rtMs != null) {
                        capturedResponse = response;
                        responseSeen = true;
                    }
                }
                if (isLast && onResponse) {
                    onResponse(capturedResponse, data);
                }
            },
        });
    });
    if (!responseTerminatesTrial) {
        if (feedback?.enabled && feedback.phaseMode === "post_response" && feedback.durationMs > 0 && renderFeedback) {
            timeline.push({
                type: CanvasKeyboardResponsePlugin,
                stimulus: renderFeedback,
                canvas_size: canvasSize,
                choices: "NO_KEYS",
                response_ends_trial: false,
                trial_duration: Math.max(0, Math.round(feedback.durationMs)),
                data: { ...baseData, phase: phaseName("post_response_feedback") },
            });
        }
        else {
            const postStimMs = postResponseContent === "blank" ? 0 : durations.postResponseStimulusMs;
            const postBlankMs = postResponseContent === "blank"
                ? durations.postResponseStimulusMs + durations.postResponseBlankMs
                : durations.postResponseBlankMs;
            if (postStimMs > 0) {
                timeline.push({
                    type: CanvasKeyboardResponsePlugin,
                    stimulus: renderStimulus,
                    canvas_size: canvasSize,
                    choices: "NO_KEYS",
                    response_ends_trial: false,
                    trial_duration: Math.max(0, Math.round(postStimMs)),
                    data: { ...baseData, phase: phaseName("post_response_stimulus") },
                });
            }
            if (postBlankMs > 0) {
                timeline.push({
                    type: CanvasKeyboardResponsePlugin,
                    stimulus: renderBlank,
                    canvas_size: canvasSize,
                    choices: "NO_KEYS",
                    response_ends_trial: false,
                    trial_duration: Math.max(0, Math.round(postBlankMs)),
                    data: { ...baseData, phase: phaseName("post_response_blank") },
                });
            }
        }
    }
    if (feedback?.enabled && feedback.durationMs > 0 && renderFeedback) {
        if (responseTerminatesTrial || feedback.phaseMode === "separate") {
            timeline.push({
                type: CanvasKeyboardResponsePlugin,
                stimulus: renderFeedback,
                canvas_size: canvasSize,
                choices: "NO_KEYS",
                response_ends_trial: false,
                trial_duration: Math.max(0, Math.round(feedback.durationMs)),
                data: { ...baseData, phase: phaseName("feedback") },
            });
        }
    }
    return timeline;
}
//# sourceMappingURL=jspsychRtTask.js.map