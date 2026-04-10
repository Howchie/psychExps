/**
 * Resman tank bar widget.
 *
 * Renders a vertical tank bar showing fluid level, max capacity, an
 * optional target zone indicator, and a label. The fluid bar fills from
 * the bottom. Colour changes when the level is outside the tolerance zone.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TankConfig {
  /** Tank identifier (e.g., "a", "b"). */
  id: string;
  /** Display label (e.g., "A"). */
  label: string;
  /** Maximum capacity of the tank. */
  maxLevel: number;
  /** Target level (undefined if no target). */
  targetLevel?: number;
  /** Tolerance radius around target level for "in-tolerance" zone. */
  toleranceRadius?: number;
  /** Whether the tank is depletable (affects level display). */
  depletable: boolean;
}

export interface TankState {
  /** Current fluid level. */
  level: number;
  /** Whether the tank is currently within tolerance of its target. */
  inTolerance: boolean;
}

export interface TankRenderOptions {
  /** Canvas 2D context to draw into. */
  ctx: CanvasRenderingContext2D;
  /** Top-left X. */
  x: number;
  /** Top-left Y. */
  y: number;
  /** Width of the tank area. */
  width: number;
  /** Height of the tank area. */
  height: number;
  /** Which side to draw the label on. */
  labelSide?: "left" | "right";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LABEL_OFFSET = 14;
const TANK_BORDER_WIDTH = 1.5;
const TANK_BG_COLOR = "#ffffff";
const FLUID_COLOR_NORMAL = "#8edbb0";
const FLUID_COLOR_OUT = "#e04545";
const TOLERANCE_COLOR = "#323232";
const TOLERANCE_WIDTH = 2;
const LEVEL_FONT = "11px sans-serif";
const LABEL_FONT = "bold 12px sans-serif";

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderTank(
  config: TankConfig,
  state: TankState,
  opts: TankRenderOptions,
): void {
  const { ctx, x, y, width, height } = opts;
  const labelSide = opts.labelSide ?? "left";

  const labelSpace = 18;
  const levelTextSpace = 14;
  const barTop = y + labelSpace;
  const barHeight = height - labelSpace - levelTextSpace;
  const barWidth = width;

  // Label above.
  ctx.fillStyle = "#323232";
  ctx.font = LABEL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(config.label, x + barWidth / 2, y);

  // Tank background.
  ctx.fillStyle = TANK_BG_COLOR;
  ctx.fillRect(x, barTop, barWidth, barHeight);

  // Fluid level (fills from bottom).
  const fraction = Math.max(0, Math.min(1, state.level / config.maxLevel));
  const fluidHeight = fraction * barHeight;
  const fluidY = barTop + barHeight - fluidHeight;

  ctx.fillStyle = state.inTolerance ? FLUID_COLOR_NORMAL : FLUID_COLOR_OUT;
  ctx.fillRect(x, fluidY, barWidth, fluidHeight);

  // Target zone indicator.
  if (config.targetLevel != null && config.toleranceRadius != null) {
    const targetFrac = config.targetLevel / config.maxLevel;
    const radFrac = config.toleranceRadius / config.maxLevel;
    const zoneCenterY = barTop + barHeight - targetFrac * barHeight;
    const zoneTopY = barTop + barHeight - (targetFrac + radFrac) * barHeight;
    const zoneBottomY = barTop + barHeight - (targetFrac - radFrac) * barHeight;

    // Draw tolerance zone bracket lines.
    ctx.strokeStyle = TOLERANCE_COLOR;
    ctx.lineWidth = TOLERANCE_WIDTH;

    // Top line of zone.
    const clampedZoneTop = Math.max(barTop, zoneTopY);
    const clampedZoneBottom = Math.min(barTop + barHeight, zoneBottomY);
    ctx.beginPath();
    ctx.moveTo(x + 2, clampedZoneTop);
    ctx.lineTo(x + barWidth - 2, clampedZoneTop);
    ctx.stroke();

    // Bottom line of zone.
    ctx.beginPath();
    ctx.moveTo(x + 2, clampedZoneBottom);
    ctx.lineTo(x + barWidth - 2, clampedZoneBottom);
    ctx.stroke();

    // Centre target line (dashed).
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    const clampedCenter = Math.max(barTop, Math.min(barTop + barHeight, zoneCenterY));
    ctx.beginPath();
    ctx.moveTo(x + 2, clampedCenter);
    ctx.lineTo(x + barWidth - 2, clampedCenter);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Border.
  ctx.strokeStyle = "#323232";
  ctx.lineWidth = TANK_BORDER_WIDTH;
  ctx.strokeRect(x, barTop, barWidth, barHeight);

  // Level text below (only for depletable tanks).
  if (config.depletable) {
    ctx.fillStyle = "#323232";
    ctx.font = LEVEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(String(Math.round(state.level)), x + barWidth / 2, barTop + barHeight + 2);
  }
}
