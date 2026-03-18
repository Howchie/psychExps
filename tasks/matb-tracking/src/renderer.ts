/**
 * Canvas renderer for the MATB compensatory tracking task.
 *
 * Draws:
 *  - A fixed circular reticle (target area) at canvas centre.
 *  - A small cursor dot whose position is controlled by the
 *    PerturbationController (perturbation + participant compensation).
 *  - Optional crosshairs through the centre.
 *
 * Also captures mouse movement deltas (not absolute position) for use
 * as the participant's compensation input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompensatoryRendererConfig {
  width: number;
  height: number;
  backgroundColor: string;
  showCrosshair: boolean;
}

export interface CompensatoryRenderFrame {
  /** Cursor offset from canvas centre (pixels). */
  cursorX: number;
  cursorY: number;
  /** Whether the cursor is currently inside the reticle. */
  inside: boolean;
}

export interface CompensatoryDisplayConfig {
  /** Radius of the reticle circle in pixels. */
  reticleRadiusPx: number;
  reticleStrokeColor: string;
  reticleStrokeWidthPx: number;
  reticleFillColor: string;
  /** Radius of the cursor dot in pixels. */
  cursorRadiusPx: number;
  cursorColorInside: string;
  cursorColorOutside: string;
}

export interface MouseDelta {
  dx: number;
  dy: number;
}

export interface CompensatoryRenderer {
  /** Consume accumulated mouse movement deltas since last call. */
  consumeMouseDelta(): MouseDelta;
  /** Render a single frame. */
  render(frame: CompensatoryRenderFrame, displayConfig: CompensatoryDisplayConfig): void;
  /** Clean up. */
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createCompensatoryRenderer(
  host: HTMLElement,
  config: CompensatoryRendererConfig,
): CompensatoryRenderer {
  host.innerHTML = "";

  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  canvas.style.width = `${config.width}px`;
  canvas.style.height = `${config.height}px`;
  canvas.style.cursor = "none"; // Hide OS cursor; we render our own.
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for compensatory tracking.");

  const centerX = config.width / 2;
  const centerY = config.height / 2;

  // Track mouse movement deltas via pointer lock or raw movementX/Y.
  let accDx = 0;
  let accDy = 0;

  const onMouseMove = (event: MouseEvent): void => {
    accDx += event.movementX;
    accDy += event.movementY;
  };

  // Request pointer lock on click so movementX/Y are reliable and the
  // cursor doesn't leave the canvas.
  const onCanvasClick = (): void => {
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
    }
  };

  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("click", onCanvasClick);

  return {
    consumeMouseDelta(): MouseDelta {
      const delta = { dx: accDx, dy: accDy };
      accDx = 0;
      accDy = 0;
      return delta;
    },

    render(frame: CompensatoryRenderFrame, dc: CompensatoryDisplayConfig): void {
      // Clear.
      ctx.clearRect(0, 0, config.width, config.height);
      ctx.fillStyle = config.backgroundColor;
      ctx.fillRect(0, 0, config.width, config.height);

      // Crosshair.
      if (config.showCrosshair) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(centerX, 0);
        ctx.lineTo(centerX, config.height);
        ctx.moveTo(0, centerY);
        ctx.lineTo(config.width, centerY);
        ctx.stroke();
      }

      // Reticle (target zone).
      ctx.fillStyle = dc.reticleFillColor;
      ctx.strokeStyle = dc.reticleStrokeColor;
      ctx.lineWidth = dc.reticleStrokeWidthPx;
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(1, dc.reticleRadiusPx), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Cursor dot.
      const cx = centerX + frame.cursorX;
      const cy = centerY + frame.cursorY;
      ctx.fillStyle = frame.inside ? dc.cursorColorInside : dc.cursorColorOutside;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, dc.cursorRadiusPx), 0, Math.PI * 2);
      ctx.fill();
    },

    destroy(): void {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("click", onCanvasClick);
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      host.innerHTML = "";
    },
  };
}
