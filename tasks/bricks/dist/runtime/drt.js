import { DrtEngine } from "@experiments/core";
import { makeRNG } from "./rng.js";
import { createSampler } from "./sampling.js";
/**
 * Bricks runtime adapter over the shared core DRT engine.
 * Presentation (audio/visual) remains local to bricks; timing/scoring lives in core.
 */
export class DRTController {
    enabled;
    events = [];
    stats = {
        presented: 0,
        hits: 0,
        misses: 0,
        falseAlarms: 0,
    };
    engine;
    constructor(config, { onEvent, seed } = {}) {
        const rng = makeRNG(seed ?? config?.trial?.seed ?? Date.now());
        const isiSampler = createSampler(config?.isi_sampler || { type: "uniform", min: 3000, max: 7000 }, rng);
        this.engine = new DrtEngine({
            enabled: Boolean(config?.enable),
            key: config?.key,
            responseDeadlineMs: Number(config?.response_deadline_ms ?? 1500),
            nextIsiMs: () => Number(isiSampler()),
        }, {
            onEvent: (event) => {
                this.events.push(event);
                onEvent?.(event);
            },
        });
        this.enabled = this.engine.enabled;
    }
    start(startTimeMs = 0) {
        this.engine.start(startTimeMs);
        this.syncStats();
    }
    step(nowMs, hooks) {
        this.engine.step(nowMs, hooks);
        this.syncStats();
    }
    handleKey(eventKey, nowMs, hooks) {
        const handled = this.engine.handleKey(eventKey, nowMs, hooks);
        this.syncStats();
        return handled;
    }
    forceEnd(nowMs, hooks) {
        this.engine.forceEnd(nowMs, hooks);
        this.syncStats();
    }
    exportData() {
        return this.engine.exportData();
    }
    syncStats() {
        const current = this.engine.exportData().stats;
        this.stats.presented = current.presented;
        this.stats.hits = current.hits;
        this.stats.misses = current.misses;
        this.stats.falseAlarms = current.falseAlarms;
    }
}
//# sourceMappingURL=drt.js.map