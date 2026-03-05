import { readJatosSelectionInput, isJatosAvailable } from "./jatos";
import { resolveParticipantIds } from "./participant";
import { parseOverridesFromUrl } from "./config";
function detectPlatform(params) {
    if (isJatosAvailable())
        return "jatos";
    if (params.get("PROLIFIC_PID") || params.get("STUDY_ID") || params.get("SESSION_ID"))
        return "prolific";
    if (params.get("SONA_ID"))
        return "sona";
    return "local";
}
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function asNonEmptyString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function parseBooleanParam(value) {
    if (value == null)
        return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return null;
    if (["1", "true", "yes", "on", "y"].includes(normalized))
        return true;
    if (["0", "false", "no", "off", "n"].includes(normalized))
        return false;
    return null;
}
export function resolveSelection(coreConfig) {
    const params = new URLSearchParams(window.location.search);
    const jatosInput = asObject(readJatosSelectionInput());
    const urlTask = asNonEmptyString(params.get("task"));
    const urlVariant = asNonEmptyString(params.get("variant"));
    const jatosTask = asNonEmptyString(jatosInput?.taskId);
    const jatosVariant = asNonEmptyString(jatosInput?.variantId);
    const taskId = jatosTask ?? urlTask ?? coreConfig.selection.taskId;
    const variantId = jatosVariant ?? urlVariant ?? coreConfig.selection.variantId;
    const taskSource = jatosTask ? "jatos" : urlTask ? "url" : "default";
    const variantSource = jatosVariant ? "jatos" : urlVariant ? "url" : "default";
    const participant = resolveParticipantIds(params, coreConfig.participant);
    const urlOverrides = parseOverridesFromUrl(params);
    const jatosOverrides = asObject(jatosInput?.overrides);
    return {
        platform: detectPlatform(params),
        taskId,
        variantId,
        configPath: asNonEmptyString(params.get("config")),
        overrides: jatosOverrides ?? urlOverrides,
        auto: parseBooleanParam(params.get("auto")),
        participant,
        completionCode: asNonEmptyString(params.get("cc")),
        source: {
            task: taskSource,
            variant: variantSource,
        },
    };
}
//# sourceMappingURL=selection.js.map