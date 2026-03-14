import { asObject } from "../utils/coerce";
export function resolveScopedModuleConfig(raw, moduleId) {
    const source = asObject(raw);
    if (!source)
        return null;
    const taskModules = asObject(asObject(source.task)?.modules);
    const localModules = asObject(source.modules);
    return asObject(localModules?.[moduleId]) ?? asObject(taskModules?.[moduleId]) ?? null;
}
//# sourceMappingURL=moduleConfig.js.map