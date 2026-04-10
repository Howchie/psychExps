/**
 * Sysmon light indicator widget.
 *
 * Renders a rectangular indicator that can be on or off.
 * When on it shows its configured colour; when off it shows a
 * neutral/background colour. A label is drawn beneath each light.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LightConfig {
  /** Unique id for this light (e.g., "light1"). */
  id: string;
  /** Display label (e.g., "F5"). */
  label: string;
  /** Colour when the light is ON. */
  onColor: string;
  /** Colour when the light is OFF. */
  offColor: string;
  /** Whether the light is on by default (before any failures). */
  defaultOn: boolean;
}

export interface LightState {
  /** Whether the light is currently on. */
  on: boolean;
}

export interface LightRenderOptions {
  /** Canvas 2D context to draw into. */
  ctx: CanvasRenderingContext2D;
  /** Top-left X of the light rectangle. */
  x: number;
  /** Top-left Y of the light rectangle. */
  y: number;
  /** Width of the light rectangle. */
  width: number;
  /** Height of the light rectangle. */
  height: number;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderLight(
  config: LightConfig,
  state: LightState,
  opts: LightRenderOptions,
): void {
  const { ctx, x, y, width, height } = opts;

  // Light rectangle — OpenMATB style: large rectangle with label inside.
  ctx.fillStyle = state.on ? config.onColor : config.offColor;
  ctx.fillRect(x, y, width, height);

  // Border.
  ctx.strokeStyle = "#323232";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, width, height);

  // Label inside the light (centered), matching OpenMATB.
  ctx.fillStyle = "#323232";
  ctx.font = `bold ${Math.max(12, Math.round(height * 0.45))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(config.label, x + width / 2, y + height / 2);
}
