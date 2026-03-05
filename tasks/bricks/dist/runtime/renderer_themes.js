// @ts-nocheck
// Deprecated shim kept for local imports. The active implementation uses
// display presets in `display_presets.ts`.
import { BUILTIN_DISPLAY_PRESETS, applyDisplayPreset, resolveDisplayPresetId, } from './display_presets.js';
export const BUILTIN_RENDER_THEMES = BUILTIN_DISPLAY_PRESETS;
export const resolveRendererThemeId = (config, opts = {}) => {
    return resolveDisplayPresetId(config, opts);
};
export const applyRendererTheme = (config, themeId) => {
    return applyDisplayPreset(config, themeId);
};
//# sourceMappingURL=renderer_themes.js.map