/**
 * Comms radio display widget.
 *
 * Renders a single radio panel showing the radio label and current
 * frequency in MHz. The selected radio is highlighted with a green border.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RadioConfig {
  id: string;
  /** Display label e.g. "COM1", "NAV2". */
  label: string;
}

export interface RadioState {
  /** Current frequency in MHz. */
  frequencyMhz: number;
  /** Whether this radio is currently selected for tuning input. */
  selected: boolean;
}

export interface RadioRenderOptions {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderRadio(
  config: RadioConfig,
  state: RadioState,
  opts: RadioRenderOptions,
): void {
  const { ctx, x, y, width, height } = opts;

  // Background.
  ctx.fillStyle = state.selected ? "#0f2a1a" : "#131313";
  ctx.fillRect(x, y, width, height);

  // Border.
  ctx.strokeStyle = state.selected ? "#22c55e" : "#333";
  ctx.lineWidth = state.selected ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  // Label (left side).
  ctx.fillStyle = state.selected ? "#22c55e" : "#888";
  ctx.font = `bold ${Math.round(height * 0.38)}px monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(config.label, x + 10, y + height / 2);

  // Frequency (right side).
  ctx.fillStyle = state.selected ? "#86efac" : "#ccc";
  ctx.font = `bold ${Math.round(height * 0.45)}px monospace`;
  ctx.textAlign = "right";
  ctx.fillText(state.frequencyMhz.toFixed(3), x + width - 10, y + height / 2);
}
