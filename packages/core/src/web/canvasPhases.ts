import {
  drawCanvasFramedScene,
  drawCanvasCenteredText,
  type CanvasFrameLayout,
  type CanvasFrameContentContext,
} from "./ui";
import {
  drawTrialFeedbackOnCanvas,
  type TrialFeedbackConfig,
  type TrialFeedbackView,
} from "./feedback";

export interface CanvasPhaseScene<TTrial> {
  layout: CanvasFrameLayout;
  frameBackground?: string;
  frameBorder?: string;
  cueColor?: string;
  /** Static cue text, or a per-trial provider (e.g. rule cues). Defaults to none. */
  cueText?: string | ((trial: TTrial | null) => string);
  /** Fixation glyph styling; the glyph itself defaults to "+". */
  fixation?: {
    text?: string;
    color?: string;
    fontSizePx?: number;
    fontWeight?: number;
  };
}

export interface CanvasPhaseDrawers<TTrial> {
  drawFixation: (canvas: HTMLCanvasElement, trial?: TTrial | null) => void;
  drawBlank: (canvas: HTMLCanvasElement, trial?: TTrial | null) => void;
  drawStimulus: (canvas: HTMLCanvasElement, trial: TTrial | null) => void;
  drawFeedback: (
    canvas: HTMLCanvasElement,
    feedback: TrialFeedbackConfig,
    view: TrialFeedbackView | null,
  ) => void;
}

/**
 * Build the standard fixation/blank/stimulus/feedback canvas renderers used
 * by framed RT tasks. Every phase draws the shared cue-and-frame scene; only
 * the stimulus content differs per task, supplied via `drawStimulus`.
 */
export function createCanvasPhaseDrawers<TTrial>(
  scene: CanvasPhaseScene<TTrial>,
  drawStimulus: (frame: CanvasFrameContentContext, trial: TTrial) => void,
): CanvasPhaseDrawers<TTrial> {
  const frameOptions = (trial: TTrial | null) => ({
    cueText: typeof scene.cueText === "function" ? scene.cueText(trial) : scene.cueText ?? "",
    cueColor: scene.cueColor,
    frameBackground: scene.frameBackground,
    frameBorder: scene.frameBorder,
  });
  const withContext = (
    canvas: HTMLCanvasElement,
    trial: TTrial | null,
    drawContent?: (frame: CanvasFrameContentContext) => void,
  ) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCanvasFramedScene(ctx, scene.layout, frameOptions(trial), drawContent);
  };

  return {
    drawFixation: (canvas, trial = null) => {
      withContext(canvas, trial, ({ ctx, centerX, centerY }) => {
        drawCanvasCenteredText(ctx, centerX, centerY, scene.fixation?.text ?? "+", {
          color: scene.fixation?.color,
          fontSizePx: scene.fixation?.fontSizePx,
          fontWeight: scene.fixation?.fontWeight,
        });
      });
    },
    drawBlank: (canvas, trial = null) => {
      withContext(canvas, trial);
    },
    drawStimulus: (canvas, trial) => {
      withContext(canvas, trial, (frame) => {
        if (trial != null) drawStimulus(frame, trial);
      });
    },
    drawFeedback: (canvas, feedback, view) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawTrialFeedbackOnCanvas(ctx, scene.layout, feedback, view);
    },
  };
}
