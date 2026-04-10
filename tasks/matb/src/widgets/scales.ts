/**
 * Sysmon scale (gauge) widget.
 *
 * Renders a vertical scale with 11 discrete positions (0-10), a
 * triangular arrow indicator, tick marks, a centre marker, and an
 * optional feedback bar below.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScaleConfig {
  /** Unique id (e.g., "scale1"). */
  id: string;
  /** Display label (e.g., "F1"). */
  label: string;
}

export interface ScaleState {
  /** Arrow position, 0-10. 5 = centre. */
  position: number;
  /** Whether the arrow is currently frozen (during feedback). */
  frozen: boolean;
}

export type FeedbackType = "positive" | "negative" | null;

export interface ScaleRenderOptions {
  ctx: CanvasRenderingContext2D;
  /** Top-left X of the scale column. */
  x: number;
  /** Top-left Y of the scale area. */
  y: number;
  /** Width of the scale column. */
  width: number;
  /** Height of the scale area. */
  height: number;
  /** Current feedback state (or null for no feedback). */
  feedback: FeedbackType;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POSITIONS = 11; // 0-10
const CENTER_POSITION = 5;
const ARROW_WIDTH = 10; // half-width of the arrow triangle in px
const ARROW_HEIGHT = 8;
const TICK_LENGTH = 6;
const CENTER_TICK_EXTRA = 4;
const FEEDBACK_BAR_HEIGHT = 8;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderScale(
  config: ScaleConfig,
  state: ScaleState,
  opts: ScaleRenderOptions,
): void {
  const { ctx, x, y, width, height } = opts;

  const centerX = x + width / 2;
  const trackTop = y + 4;
  const labelHeight = 18;
  const trackBottom = y + height - FEEDBACK_BAR_HEIGHT - labelHeight - 4;
  const trackHeight = trackBottom - trackTop;

  // Scale border rectangle — matching OpenMATB's bordered scale areas.
  const boxPad = 4;
  ctx.strokeStyle = "#323232";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + boxPad, trackTop - 2, width - boxPad * 2, trackHeight + 4);

  // Vertical track line.
  ctx.strokeStyle = "#323232";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX, trackTop);
  ctx.lineTo(centerX, trackBottom);
  ctx.stroke();

  // Tick marks — alternating long/short, matching OpenMATB scale.py.
  for (let i = 0; i < POSITIONS; i++) {
    const frac = i / (POSITIONS - 1);
    const tickY = trackTop + frac * trackHeight;
    const isLong = i % 2 === 0;
    const halfTick = isLong ? TICK_LENGTH + CENTER_TICK_EXTRA : TICK_LENGTH;

    ctx.strokeStyle = "#323232";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - halfTick, tickY);
    ctx.lineTo(centerX + halfTick, tickY);
    ctx.stroke();
  }

  // Arrow indicator (triangle pointing right, positioned along left of track).
  const clampedPos = Math.max(0, Math.min(POSITIONS - 1, Math.round(state.position)));
  const frac = clampedPos / (POSITIONS - 1);
  const arrowY = trackTop + frac * trackHeight;
  const arrowTipX = centerX - 4;

  ctx.fillStyle = "#323232";
  ctx.beginPath();
  ctx.moveTo(arrowTipX, arrowY);
  ctx.lineTo(arrowTipX - ARROW_WIDTH, arrowY - ARROW_HEIGHT);
  ctx.lineTo(arrowTipX - ARROW_WIDTH, arrowY + ARROW_HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Label below scale — matching OpenMATB (F1, F2, etc. below).
  ctx.fillStyle = "#323232";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(config.label, centerX, trackBottom + 8);

  // Feedback bar below the label.
  if (opts.feedback) {
    const fbY = trackBottom + labelHeight + 6;
    const fbWidth = width * 0.7;
    const fbX = centerX - fbWidth / 2;
    ctx.fillStyle = opts.feedback === "positive" ? "#8edbb0" : "#e04545";
    ctx.fillRect(fbX, fbY, fbWidth, FEEDBACK_BAR_HEIGHT);
  }
}
