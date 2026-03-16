import CanvasKeyboardResponsePlugin from "@jspsych/plugin-canvas-keyboard-response";

export interface JsPsychRtTimelinePhaseDurations {
  preFixationBlankMs: number;
  fixationMs: number;
  blankMs: number;
  responseMs: number;
  responsePreStimulusBlankMs: number;
  responseStimulusMs: number;
  responsePostStimulusBlankMs: number;
  postResponseStimulusMs: number;
  postResponseBlankMs: number;
}

export interface JsPsychRtTimelineConfig {
  phasePrefix: string;
  responseTerminatesTrial: boolean;
  durations: JsPsychRtTimelinePhaseDurations;
  canvasSize: [number, number];
  allowedKeys: "NO_KEYS" | string | string[];
  baseData: Record<string, unknown>;
  renderFixation: (canvas: HTMLCanvasElement) => void;
  renderBlank: (canvas: HTMLCanvasElement) => void;
  renderStimulus: (canvas: HTMLCanvasElement) => void;
  renderFeedback?: (canvas: HTMLCanvasElement) => void;
  feedback?: {
    enabled: boolean;
    durationMs: number;
    phaseMode: "separate" | "post_response";
  };
  postResponseContent?: "blank" | "stimulus";
  onResponse?: (response: { key: string | null; rtMs: number | null }, data: Record<string, unknown>) => void;
}

export function buildJsPsychRtTimelineNodes(config: JsPsychRtTimelineConfig): any[] {
  const {
    phasePrefix,
    responseTerminatesTrial,
    durations,
    canvasSize,
    allowedKeys,
    baseData,
    renderFixation,
    renderBlank,
    renderStimulus,
    renderFeedback,
    feedback,
    postResponseContent = "stimulus",
    onResponse,
  } = config;

  const timeline: any[] = [];

  if (durations.preFixationBlankMs > 0) {
    timeline.push({
      type: CanvasKeyboardResponsePlugin,
      stimulus: renderBlank,
      canvas_size: canvasSize,
      choices: "NO_KEYS",
      response_ends_trial: false,
      trial_duration: Math.max(0, Math.round(durations.preFixationBlankMs)),
      data: { ...baseData, phase: `${phasePrefix}_pre_fixation_blank` },
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
      data: { ...baseData, phase: `${phasePrefix}_fixation` },
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
      data: { ...baseData, phase: `${phasePrefix}_blank` },
    });
  }

  const responseSegments: Array<{ phase: string; durationMs: number; showStimulus: boolean }> = [];
  if (!responseTerminatesTrial) {
    if (durations.responsePreStimulusBlankMs > 0) {
      responseSegments.push({
        phase: `${phasePrefix}_response_window_pre_stim_blank`,
        durationMs: durations.responsePreStimulusBlankMs,
        showStimulus: false,
      });
    }
    if (durations.responseStimulusMs > 0) {
      responseSegments.push({
        phase: `${phasePrefix}_response_window_stimulus`,
        durationMs: durations.responseStimulusMs,
        showStimulus: true,
      });
    }
    if (durations.responsePostStimulusBlankMs > 0) {
      responseSegments.push({
        phase: `${phasePrefix}_response_window_post_stim_blank`,
        durationMs: durations.responsePostStimulusBlankMs,
        showStimulus: false,
      });
    }
  }
  if (responseSegments.length === 0 && durations.responseMs > 0) {
    responseSegments.push({
      phase: `${phasePrefix}_response_window`,
      durationMs: durations.responseMs,
      showStimulus: true,
    });
  }

  let capturedResponse: { key: string | null; rtMs: number | null } = { key: null, rtMs: null };
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
      on_finish: (data: Record<string, unknown>) => {
        if (!responseSeen) {
          const rawKey = data.response;
          const rawRt = data.rt;
          const key = typeof rawKey === "string" ? rawKey.toLowerCase() : null;
          const rtMs = typeof rawRt === "number" && Number.isFinite(rawRt) ? rawRt : null;
          if (key || rtMs != null) {
            capturedResponse = { key, rtMs };
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
        data: { ...baseData, phase: `${phasePrefix}_post_response_feedback` },
      });
    } else {
      const postStimMs = postResponseContent === "blank" ? 0 : durations.postResponseStimulusMs;
      const postBlankMs =
        postResponseContent === "blank"
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
          data: { ...baseData, phase: `${phasePrefix}_post_response_stimulus` },
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
          data: { ...baseData, phase: `${phasePrefix}_post_response_blank` },
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
        data: { ...baseData, phase: `${phasePrefix}_feedback` },
      });
    }
  }

  return timeline;
}
