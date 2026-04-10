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
  const fontSize = Math.max(12, Math.round(height * 0.38));

  // OpenMATB style: light background, radio label + frequency on same row.
  // Selected radio has up/down arrows on left and left/right arrows on right.

  // Label (left side).
  ctx.fillStyle = "#323232";
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(config.label, x + (state.selected ? 30 : 10), y + height / 2);

  // Frequency (right side) — OpenMATB shows e.g. "127.0" (1 decimal).
  ctx.fillStyle = "#323232";
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText(state.frequencyMhz.toFixed(1), x + width - (state.selected ? 30 : 10), y + height / 2);

  // Arrows on selected radio — matching OpenMATB radio.py.
  if (state.selected) {
    const arrowSize = Math.round(fontSize * 0.4);
    const midY = y + height / 2;

    // Up/down arrows on the left.
    ctx.fillStyle = "#323232";
    ctx.beginPath();
    ctx.moveTo(x + 12, midY - 3);
    ctx.lineTo(x + 12 - arrowSize, midY - 3);
    ctx.lineTo(x + 12 - arrowSize / 2, midY - 3 - arrowSize);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 12, midY + 3);
    ctx.lineTo(x + 12 - arrowSize, midY + 3);
    ctx.lineTo(x + 12 - arrowSize / 2, midY + 3 + arrowSize);
    ctx.closePath();
    ctx.fill();

    // Left/right arrows on the right.
    const rx = x + width - 12;
    ctx.beginPath();
    ctx.moveTo(rx - arrowSize, midY);
    ctx.lineTo(rx - arrowSize * 2, midY - arrowSize);
    ctx.lineTo(rx - arrowSize * 2, midY + arrowSize);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(rx, midY);
    ctx.lineTo(rx + arrowSize, midY - arrowSize);
    ctx.lineTo(rx + arrowSize, midY + arrowSize);
    ctx.closePath();
    ctx.fill();
  }
}
