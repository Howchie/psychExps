/**
 * MATB Pump Status sub-task (display-only).
 *
 * Shows 8 pump flow rate indicators matching OpenMATB's "PUMP STATUS"
 * panel (bottom-right). Each pump displays its number, a directional arrow,
 * and current flow rate (0 when off).
 *
 * This panel reads live pump state from resman via a provider callback
 * set by the adapter after construction.
 */

import {
  type SubTaskHandle,
  type SubTaskPerformance,
  type ScenarioEvent,
} from "@experiments/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PumpStateEntry {
  label: string;
  state: "off" | "on" | "failure";
  flowPerMinute: number;
}

export type PumpStateProvider = () => PumpStateEntry[];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createPumpStatusSubTaskHandle(): SubTaskHandle<null> & {
  setPumpStateProvider(provider: PumpStateProvider): void;
} {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let container: HTMLElement | null = null;
  let pumpProvider: PumpStateProvider | null = null;

  function render(): void {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, w, h);

    const pumps = pumpProvider ? pumpProvider() : [];
    const axisColor = "#323232";
    if (pumps.length === 0) return;
    const rowH = Math.floor((h - 16) / pumps.length);
    const startY = 12;

    for (let i = 0; i < pumps.length; i++) {
      const p = pumps[i];
      const y = startY + i * rowH;
      const midY = y + rowH / 2;
      const flow = p.state === "on" ? p.flowPerMinute : 0;

      // Pump number.
      ctx.fillStyle = axisColor;
      ctx.font = "13px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(p.label, w * 0.25, midY);

      // Directional arrow (triangle pointing right) — matching OpenMATB PumpFlow.
      const arrowX = w * 0.45;
      const arrowSize = 5;
      const arrowColor = p.state === "failure" ? "#e04545" : axisColor;
      ctx.fillStyle = arrowColor;
      ctx.beginPath();
      ctx.moveTo(arrowX + arrowSize, midY);
      ctx.lineTo(arrowX - arrowSize, midY - arrowSize);
      ctx.lineTo(arrowX - arrowSize, midY + arrowSize);
      ctx.closePath();
      ctx.fill();

      // Flow rate value.
      ctx.fillStyle = axisColor;
      ctx.font = "13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(String(flow), w * 0.58, midY);
    }
  }

  return {
    id: "pumpstatus",

    /**
     * Wire up the live pump state provider (called by the adapter
     * after constructing both resman and pumpstatus handles).
     */
    setPumpStateProvider(provider: PumpStateProvider): void {
      pumpProvider = provider;
    },

    start(host: HTMLElement, _rawConfig: Record<string, unknown>): void {
      container = host;
      container.innerHTML = "";

      canvas = document.createElement("canvas");
      // Use container's dimensions for crisp rendering.
      canvas.width = container.clientWidth || 160;
      canvas.height = container.clientHeight || 400;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      container.appendChild(canvas);

      ctx = canvas.getContext("2d");
      render();
    },

    step(): void {
      // Re-measure container if canvas was created before layout completed.
      if (canvas && container) {
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
          canvas.width = cw;
          canvas.height = ch;
        }
      }
      render();
    },

    handleKeyDown(): boolean {
      return false;
    },

    handleScenarioEvent(_event: ScenarioEvent): void {
      // No-op — pump status reads live state from resman via provider.
    },

    stop(): null {
      if (container) container.innerHTML = "";
      canvas = null;
      ctx = null;
      container = null;
      return null;
    },

    getPerformance(): SubTaskPerformance {
      return { score: 1 };
    },
  };
}
