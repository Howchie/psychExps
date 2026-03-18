/**
 * Scenario event scheduler for timed event injection.
 *
 * Manages a sorted queue of events keyed by elapsed time. On each tick,
 * returns all events whose time has been reached or passed since the
 * last tick. Pure logic — no rendering or DOM interaction.
 *
 * Usage:
 *   const scheduler = new ScenarioScheduler([
 *     { timeMs: 0,     targetId: "sysmon",  command: "start" },
 *     { timeMs: 10000, targetId: "sysmon",  command: "set", path: "scales.0.failure", value: true },
 *     { timeMs: 60000, targetId: "*",       command: "stop" },
 *   ]);
 *   // In rAF loop:
 *   const dueEvents = scheduler.tick(elapsedMs);
 *   for (const event of dueEvents) { routeToSubTask(event); }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioEvent {
  /** Time in milliseconds from scenario start when this event fires. */
  timeMs: number;
  /** Identifier of the sub-task this event targets. Use "*" for broadcast. */
  targetId: string;
  /** Command name (e.g., "start", "stop", "set", "prompt"). */
  command: string;
  /** Dot-delimited path for "set" commands (e.g., "scales.0.failure"). */
  path?: string;
  /** Value for "set" or payload for other commands. */
  value?: unknown;
}

// ---------------------------------------------------------------------------
// ScenarioScheduler
// ---------------------------------------------------------------------------

export class ScenarioScheduler {
  /** Events sorted ascending by timeMs. */
  private readonly events: ScenarioEvent[];
  /** Index of the next event to consider. */
  private cursor = 0;
  /** Last elapsed time passed to tick(). */
  private lastTickMs = -1;

  constructor(events: ScenarioEvent[]) {
    // Defensive copy, sorted by time.
    this.events = [...events].sort((a, b) => a.timeMs - b.timeMs);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Advance the scheduler to the given elapsed time and return all events
   * that have become due since the previous tick. Each event fires at
   * most once. Safe to call with the same or earlier time (returns []).
   */
  tick(elapsedMs: number): ScenarioEvent[] {
    if (elapsedMs <= this.lastTickMs) return [];
    const due: ScenarioEvent[] = [];
    while (this.cursor < this.events.length && this.events[this.cursor].timeMs <= elapsedMs) {
      due.push(this.events[this.cursor]);
      this.cursor += 1;
    }
    this.lastTickMs = elapsedMs;
    return due;
  }

  /**
   * Reset the scheduler to the beginning. Useful if you want to replay.
   */
  reset(): void {
    this.cursor = 0;
    this.lastTickMs = -1;
  }

  /**
   * Number of events remaining (not yet fired).
   */
  remaining(): number {
    return Math.max(0, this.events.length - this.cursor);
  }

  /**
   * Total number of events in the scenario.
   */
  total(): number {
    return this.events.length;
  }

  /**
   * Time (ms) of the last event in the scenario, or 0 if empty.
   */
  totalDurationMs(): number {
    return this.events.length > 0 ? this.events[this.events.length - 1].timeMs : 0;
  }

  /**
   * Returns a shallow copy of all events (for inspection / scheduling display).
   */
  allEvents(): ScenarioEvent[] {
    return [...this.events];
  }
}
