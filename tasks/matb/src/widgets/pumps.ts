/**
 * Resman pump indicator widget.
 *
 * Renders a triangular pump symbol with colour coding for its state
 * (off = white, on = green, failed = red) and a label inside.
 * Optionally renders a connector line between source and destination
 * positions.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PumpState = "off" | "on" | "failure";

export interface PumpConfig {
  /** Pump identifier (e.g., "1"). */
  id: string;
  /** Display label (e.g., "1"). */
  label: string;
}

export interface PumpRenderOptions {
  /** Canvas 2D context to draw into. */
  ctx: CanvasRenderingContext2D;
  /** Centre X of the pump triangle. */
  cx: number;
  /** Centre Y of the pump triangle. */
  cy: number;
  /** Size (half-width) of the pump triangle. */
  size: number;
  /** Direction the triangle points: "up", "down", "left", "right". */
  direction: "up" | "down" | "left" | "right";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PUMP_COLOR_OFF = "#ffffff";
const PUMP_COLOR_ON = "#8edbb0";
const PUMP_COLOR_FAILURE = "#e04545";
const PUMP_BORDER_COLOR = "#323232";
const PUMP_BORDER_WIDTH = 1;
const PUMP_LABEL_FONT = "bold 10px sans-serif";

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function getPumpFillColor(state: PumpState): string {
  if (state === "on") return PUMP_COLOR_ON;
  if (state === "failure") return PUMP_COLOR_FAILURE;
  return PUMP_COLOR_OFF;
}

/**
 * Render a pump triangle at the given centre position.
 */
export function renderPump(
  config: PumpConfig,
  state: PumpState,
  opts: PumpRenderOptions,
): void {
  const { ctx, cx, cy, size, direction } = opts;

  // Compute triangle vertices based on direction.
  let p1x: number, p1y: number;
  let p2x: number, p2y: number;
  let p3x: number, p3y: number;

  switch (direction) {
    case "up":
      p1x = cx; p1y = cy - size;
      p2x = cx - size; p2y = cy + size;
      p3x = cx + size; p3y = cy + size;
      break;
    case "down":
      p1x = cx; p1y = cy + size;
      p2x = cx - size; p2y = cy - size;
      p3x = cx + size; p3y = cy - size;
      break;
    case "left":
      p1x = cx - size; p1y = cy;
      p2x = cx + size; p2y = cy - size;
      p3x = cx + size; p3y = cy + size;
      break;
    case "right":
    default:
      p1x = cx + size; p1y = cy;
      p2x = cx - size; p2y = cy - size;
      p3x = cx - size; p3y = cy + size;
      break;
  }

  ctx.fillStyle = getPumpFillColor(state);
  ctx.beginPath();
  ctx.moveTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.lineTo(p3x, p3y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = PUMP_BORDER_COLOR;
  ctx.lineWidth = PUMP_BORDER_WIDTH;
  ctx.stroke();

  // Label inside the triangle.
  ctx.fillStyle = "#323232";
  ctx.font = PUMP_LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(config.label, cx, cy);
}

/**
 * Draw a connector line between two points (e.g., source tank to pump, pump to dest tank).
 */
export function renderConnector(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  active: boolean,
): void {
  ctx.strokeStyle = active ? "#8edbb0" : "#323232";
  ctx.lineWidth = active ? 2 : 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
