import { captureTimedResponse, sleep } from "../web/ui";
export async function runTrialTimeline(args) {
    const stages = (args.stages ?? []).map((stage, index) => ({
        id: String(stage.id || `stage_${index + 1}`),
        durationMs: Math.max(0, Number(stage.durationMs) || 0),
        render: stage.render,
    }));
    const stageTimings = [];
    let offsetMs = 0;
    for (const stage of stages) {
        const startMs = offsetMs;
        const endMs = startMs + stage.durationMs;
        stageTimings.push({ id: stage.id, startMs, endMs });
        offsetMs = endMs;
    }
    const totalDurationMs = offsetMs;
    const responsePromise = args.response
        ? captureTimedResponse({
            allowedKeys: args.response.allowedKeys,
            totalDurationMs,
            startMs: args.response.startMs,
            endMs: args.response.endMs,
        })
        : Promise.resolve({ key: null, rtMs: null });
    for (const stage of stages) {
        const rendered = stage.render?.();
        if (typeof rendered === "string") {
            args.container.innerHTML = rendered;
        }
        await sleep(stage.durationMs);
    }
    const response = await responsePromise;
    return {
        key: response.key,
        rtMs: response.rtMs,
        totalDurationMs,
        stageTimings,
    };
}
//# sourceMappingURL=trial.js.map