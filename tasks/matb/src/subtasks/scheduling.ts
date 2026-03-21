/**
 * MATB Scheduling sub-task (display-only).
 *
 * Shows a timeline with minute markers, schedule columns (S, T, C, R)
 * indicating which subtasks are currently running/manual, and an elapsed
 * time display. Matching OpenMATB plugins/scheduling.py.
 *
 * The panel reads live elapsed time from the concurrent runner clock
 * (passed each frame via step()) and renders the current session progress.
 */

import {
  type SubTaskHandle,
  type SubTaskPerformance,
  type ScenarioEvent,
} from "@experiments/core";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SchedulingSubTaskConfig {
  /** Total session duration in minutes (for the timeline). Default 8. */
  durationMinutes?: number;
  /** Whether to show the elapsed time chronometer. Default true. */
  displayChronometer?: boolean;
  /** Whether to count down instead of up. Default false. */
  reverseChronometer?: boolean;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SubtaskRunningProvider = () => {
  sysmon: boolean;
  tracking: boolean;
  comms: boolean;
  resman: boolean;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSchedulingSubTaskHandle(): SubTaskHandle<null> & {
  setSubtaskRunningProvider(provider: SubtaskRunningProvider): void;
} {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let container: HTMLElement | null = null;
  let durationMinutes = 8;
  let displayChronometer = true;
  let reverseChronometer = false;
  let elapsedMs = 0;
  let runningProvider: SubtaskRunningProvider | null = null;

  function formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function render(): void {
    if (!ctx || !canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, w, h);

    const axisColor = "#323232";
    const greyColor = "#c8c8c8";

    // Layout: timeline on left, 4 schedule columns, elapsed time at bottom.
    const topPad = 16;
    const botPad = 30;
    const timelineAreaH = h - topPad - botPad;
    const timelineX = w * 0.28;
    const colStartX = w * 0.34;
    const colEndX = w * 0.95;
    const colW = (colEndX - colStartX) / 4;

    // Timeline axis — vertical line with graduation marks.
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(timelineX, topPad);
    ctx.lineTo(timelineX, topPad + timelineAreaH);
    ctx.stroke();

    // Minute marks and labels.
    const totalIntervals = durationMinutes * 2;
    const gradW = w * 0.06;
    for (let i = 0; i <= totalIntervals; i++) {
      const frac = i / totalIntervals;
      const y = topPad + frac * timelineAreaH;
      const isMinute = i % 2 === 0;
      const tickLen = isMinute ? gradW : gradW / 2;

      ctx.strokeStyle = axisColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(timelineX - tickLen, y);
      ctx.lineTo(timelineX, y);
      ctx.stroke();

      if (isMinute) {
        ctx.fillStyle = axisColor;
        ctx.font = "12px sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i / 2), timelineX - tickLen - 4, y);
      }
    }

    // "min." label at bottom of timeline.
    ctx.fillStyle = axisColor;
    ctx.font = "italic 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("min.", w * 0.14, topPad + timelineAreaH + 4);

    // Get current running states.
    const running = runningProvider
      ? runningProvider()
      : { sysmon: true, tracking: true, comms: true, resman: true };

    // Schedule columns (S, T, C, R).
    const labels = ["S", "T", "C", "R"];
    const runningStates = [running.sysmon, running.tracking, running.comms, running.resman];

    // Compute elapsed position on timeline.
    const maxSec = durationMinutes * 60;
    const elapsedSec = Math.min(elapsedMs / 1000, maxSec);
    const elapsedFrac = elapsedSec / maxSec;

    for (let c = 0; c < 4; c++) {
      const cx = colStartX + c * colW + colW / 2;

      // Column label at top.
      ctx.fillStyle = axisColor;
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(labels[c], cx, topPad - 2);

      // Vertical column line.
      ctx.strokeStyle = greyColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, topPad);
      ctx.lineTo(cx, topPad + timelineAreaH);
      ctx.stroke();

      // Top bound marker (indicates current position / running state).
      const boundR = 4;
      const boundColor = runningStates[c] ? "#8edbb0" : greyColor;
      ctx.fillStyle = boundColor;
      ctx.fillRect(cx - boundR, topPad, boundR * 2, boundR * 2);

      // Bottom bound marker.
      ctx.fillStyle = greyColor;
      ctx.fillRect(cx - boundR, topPad + timelineAreaH - boundR * 2, boundR * 2, boundR * 2);

      // Running segment — shows a green bar from top to elapsed position
      // when the subtask is running (manual mode).
      if (runningStates[c]) {
        const segEndY = topPad + elapsedFrac * timelineAreaH;
        const barW = 3;
        ctx.fillStyle = "#8edbb0";
        ctx.fillRect(cx - barW, topPad, barW * 2, segEndY - topPad);
      }
    }

    // Elapsed time display at bottom — matching OpenMATB.
    if (displayChronometer) {
      const displayMs = reverseChronometer
        ? Math.max(0, durationMinutes * 60 * 1000 - elapsedMs)
        : elapsedMs;
      const label = reverseChronometer ? "Remaining time" : "Elapsed time";
      const timeStr = formatTime(displayMs);

      ctx.fillStyle = axisColor;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(label, 4, h - 6);
      ctx.textAlign = "right";
      ctx.fillText(timeStr, w - 4, h - 6);
    }
  }

  return {
    id: "scheduling",

    /**
     * Wire up the subtask running state provider (called by the adapter).
     */
    setSubtaskRunningProvider(provider: SubtaskRunningProvider): void {
      runningProvider = provider;
    },

    start(host: HTMLElement, rawConfig: Record<string, unknown>): void {
      container = host;
      container.innerHTML = "";
      durationMinutes = Number(rawConfig?.durationMinutes) || 8;
      displayChronometer = rawConfig?.displayChronometer !== false;
      reverseChronometer = rawConfig?.reverseChronometer === true;
      elapsedMs = 0;

      canvas = document.createElement("canvas");
      // Use container's dimensions for crisp rendering.
      canvas.width = container.clientWidth || 200;
      canvas.height = container.clientHeight || 400;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.objectFit = "contain";
      container.appendChild(canvas);

      ctx = canvas.getContext("2d");
      render();
    },

    step(_now: number, dt: number): void {
      elapsedMs += dt;
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
      // Scheduling reads live state via provider.
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
