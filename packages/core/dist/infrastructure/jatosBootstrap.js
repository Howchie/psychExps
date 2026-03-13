import { getJatosApi, readJatosSelectionInput } from "./jatos";
import { resolveSelection } from "./selection";
const DEFAULT_JATOS_SCRIPT_CANDIDATES = [
    "/assets/lib/jatos-publix/javascripts/jatos.js",
    "/jatos/assets/lib/jatos-publix/javascripts/jatos.js",
    "/jatos/jatos.js",
    "/jatos.js",
    "jatos.js",
];
export async function loadJatosScriptCandidates(candidates = DEFAULT_JATOS_SCRIPT_CANDIDATES) {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return { loaded: false, loadedFrom: null, attempts: [] };
    }
    if (getJatosApi()) {
        return { loaded: true, loadedFrom: null, attempts: [] };
    }
    const attempts = [];
    const seen = new Set();
    for (const candidate of candidates) {
        const src = String(candidate ?? "").trim();
        if (!src || seen.has(src))
            continue;
        seen.add(src);
        attempts.push(src);
        const loaded = await new Promise((resolve) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
        if (loaded) {
            return { loaded: true, loadedFrom: src, attempts };
        }
    }
    return { loaded: false, loadedFrom: null, attempts };
}
export async function waitForJatosReady(timeoutMs = 2000) {
    const api = getJatosApi();
    if (!api)
        return;
    if (typeof api.onLoad === "function") {
        await new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled)
                    return;
                settled = true;
                resolve();
            };
            const timer = window.setTimeout(done, timeoutMs);
            api.onLoad?.(() => {
                window.clearTimeout(timer);
                done();
            });
        });
        return;
    }
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const latest = getJatosApi();
        if (latest?.componentJsonInput != null || latest?.studySessionData != null)
            return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
}
export async function resolveSelectionWithJatosRetry(coreConfig, maxWaitMs = 10000) {
    if (typeof window === "undefined")
        return resolveSelection(coreConfig);
    const started = Date.now();
    let selection = resolveSelection(coreConfig);
    const hasUrlTask = new URLSearchParams(window.location.search).get("task") != null;
    while (selection.platform === "jatos"
        && selection.source.task === "default"
        && !hasUrlTask
        && Date.now() - started < maxWaitMs) {
        if (readJatosSelectionInput() != null) {
            selection = resolveSelection(coreConfig);
            if (selection.source.task !== "default")
                break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return selection;
}
//# sourceMappingURL=jatosBootstrap.js.map