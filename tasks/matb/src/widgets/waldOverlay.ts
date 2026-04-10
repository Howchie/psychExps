/**
 * Wald Transform Diagnostic Overlay.
 *
 * Displays real-time Bayesian Wald accumulator parameter estimates from
 * the DRT module: drift rate (v), threshold (a), non-decision time (t0),
 * credible intervals, and a sparkline of drift rate over time.
 *
 * Designed to sit in the MATB display area (near where the visual DRT
 * stimulus would otherwise appear) and toggled via config.
 */

import type { OnlineParameterTransformEstimate } from "@experiments/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaldOverlayConfig {
  /** Whether the overlay is visible. Default false. */
  enabled?: boolean;
  /** Max number of sparkline points to retain. Default 60. */
  maxSparklinePoints?: number;
  /** Position within the MATB display. Default "bottom-right". */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

// ---------------------------------------------------------------------------
// WaldOverlay
// ---------------------------------------------------------------------------

export class WaldOverlay {
  private readonly el: HTMLElement;
  private readonly sparklineCanvas: HTMLCanvasElement;
  private readonly paramEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly maxPoints: number;
  private readonly driftHistory: { v: number; lower: number; upper: number }[] = [];
  private visible: boolean;

  constructor(
    private readonly parent: HTMLElement,
    config?: WaldOverlayConfig,
  ) {
    this.maxPoints = config?.maxSparklinePoints ?? 60;
    this.visible = config?.enabled !== false;

    const pos = config?.position ?? "bottom-right";

    // Container
    this.el = document.createElement("div");
    this.el.style.position = "absolute";
    this.el.style.zIndex = "9000";
    this.el.style.background = "rgba(15, 23, 42, 0.88)";
    this.el.style.border = "1px solid rgba(100, 116, 139, 0.4)";
    this.el.style.borderRadius = "6px";
    this.el.style.padding = "8px 10px";
    this.el.style.fontFamily = "monospace";
    this.el.style.fontSize = "11px";
    this.el.style.color = "#e2e8f0";
    this.el.style.lineHeight = "1.5";
    this.el.style.pointerEvents = "none";
    this.el.style.userSelect = "none";
    this.el.style.minWidth = "180px";

    // Position
    if (pos.includes("bottom")) this.el.style.bottom = "8px";
    else this.el.style.top = "8px";
    if (pos.includes("right")) this.el.style.right = "8px";
    else this.el.style.left = "8px";

    // Title
    const title = document.createElement("div");
    title.style.fontWeight = "bold";
    title.style.fontSize = "10px";
    title.style.color = "#94a3b8";
    title.style.marginBottom = "4px";
    title.style.letterSpacing = "0.5px";
    title.textContent = "WALD TRANSFORM";
    this.el.appendChild(title);

    // Status line (sample size / waiting)
    this.statusEl = document.createElement("div");
    this.statusEl.style.color = "#64748b";
    this.statusEl.style.fontSize = "10px";
    this.statusEl.style.marginBottom = "4px";
    this.statusEl.textContent = "Awaiting data…";
    this.el.appendChild(this.statusEl);

    // Parameters display
    this.paramEl = document.createElement("div");
    this.paramEl.style.whiteSpace = "pre";
    this.el.appendChild(this.paramEl);

    // Sparkline canvas
    this.sparklineCanvas = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    this.sparklineCanvas.width = 160 * dpr;
    this.sparklineCanvas.height = 40 * dpr;
    this.sparklineCanvas.style.width = "160px";
    this.sparklineCanvas.style.height = "40px";
    this.sparklineCanvas.style.marginTop = "4px";
    this.sparklineCanvas.style.display = "block";
    this.el.appendChild(this.sparklineCanvas);

    // Sparkline label
    const sparkLabel = document.createElement("div");
    sparkLabel.style.fontSize = "9px";
    sparkLabel.style.color = "#64748b";
    sparkLabel.style.marginTop = "1px";
    sparkLabel.textContent = "drift rate (v)";
    this.el.appendChild(sparkLabel);

    if (!this.visible) this.el.style.display = "none";
    parent.appendChild(this.el);
  }

  /**
   * Push a new Wald estimate to the overlay. Call this from the
   * DRT onTransformEstimate callback.
   */
  update(estimate: OnlineParameterTransformEstimate): void {
    const v  = estimate.values?.drift_rate;
    const a  = estimate.values?.threshold;
    const t0 = estimate.values?.t0;
    const vLo = estimate.intervals?.drift_rate?.lower;
    const vHi = estimate.intervals?.drift_rate?.upper;
    const aLo = estimate.intervals?.threshold?.lower;
    const aHi = estimate.intervals?.threshold?.upper;

    // Status
    this.statusEl.textContent = `n = ${estimate.sampleSize}`;
    this.statusEl.style.color = "#94a3b8";

    // Parameter display
    const fmt = (x: number | undefined, d = 3) =>
      x != null ? x.toFixed(d) : "—";
    const ci = (lo: number | undefined, hi: number | undefined, d = 3) =>
      lo != null && hi != null ? `[${lo.toFixed(d)}, ${hi.toFixed(d)}]` : "";

    this.paramEl.textContent =
      `v  ${fmt(v)}  ${ci(vLo, vHi)}\n` +
      `a  ${fmt(a)}  ${ci(aLo, aHi)}\n` +
      `t₀ ${fmt(t0, 0)} ms`;

    // Sparkline history
    if (v != null) {
      this.driftHistory.push({
        v,
        lower: vLo ?? v,
        upper: vHi ?? v,
      });
      if (this.driftHistory.length > this.maxPoints) {
        this.driftHistory.shift();
      }
      this.renderSparkline();
    }
  }

  /** Show or hide the overlay. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.el.style.display = visible ? "" : "none";
  }

  /** Remove the overlay from the DOM. */
  dispose(): void {
    this.el.remove();
  }

  // ── Sparkline rendering ──────────────────────────────────────────────

  private renderSparkline(): void {
    const ctx = this.sparklineCanvas.getContext("2d");
    if (!ctx) return;

    const W = this.sparklineCanvas.width;
    const H = this.sparklineCanvas.height;
    const dpr = window.devicePixelRatio || 1;
    const pts = this.driftHistory;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(dpr, dpr);

    if (pts.length < 2) {
      ctx.restore();
      return;
    }

    // Find y range
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of pts) {
      yMin = Math.min(yMin, p.lower);
      yMax = Math.max(yMax, p.upper);
    }
    const yPad = (yMax - yMin) * 0.15 || 0.01;
    yMin -= yPad;
    yMax += yPad;

    const logicalW = W / dpr;
    const logicalH = H / dpr;

    const xStep = logicalW / (this.maxPoints - 1);
    const toY = (val: number) => logicalH - ((val - yMin) / (yMax - yMin)) * logicalH;
    const xOffset = (this.maxPoints - pts.length) * xStep;

    // CI band
    ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xOffset + i * xStep;
      ctx.lineTo(x, toY(pts[i].upper));
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const x = xOffset + i * xStep;
      ctx.lineTo(x, toY(pts[i].lower));
    }
    ctx.closePath();
    ctx.fill();

    // Drift rate line
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = xOffset + i * xStep;
      const y = toY(pts[i].v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Current value dot
    const lastPt = pts[pts.length - 1];
    const lastX = xOffset + (pts.length - 1) * xStep;
    const lastY = toY(lastPt.v);
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
