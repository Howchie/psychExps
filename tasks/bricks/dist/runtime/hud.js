// @ts-nocheck
/**
 * Formats HUD copy so the renderer can stay focused on drawing.
 */
export const buildHUDLines = ({ stats, remainingMs, blockLabel, drtStats, focusInfo, uiConfig = {}, drtEnabled = false }) => {
    const showTimer = uiConfig.showTimer !== false;
    const showRemainingBlocks = uiConfig.showRemainingBlocks !== false;
    const showDroppedBlocks = uiConfig.showDroppedBlocks !== false;
    const showPoints = uiConfig.showPoints === true;
    const pointsLabel = String(uiConfig.pointsLabel ?? 'Points');
    const showDRT = drtEnabled && uiConfig.showDRT !== false;
    const hasTimer = showTimer && Number.isFinite(remainingMs);
    const timeSec = hasTimer ? Math.max(0, remainingMs) / 1000 : null;
    const lines = [`Block: ${blockLabel ?? 'N/A'}`];
    if (showTimer) {
        lines.push(hasTimer ? `Time left: ${timeSec.toFixed(1)}s` : 'Time left: --');
    }
    const perfParts = [];
    if (showRemainingBlocks) {
        perfParts.push(`Active: ${stats.bricksActive}`);
    }
    perfParts.push(`Cleared: ${stats.cleared}`);
    if (showDroppedBlocks) {
        perfParts.push(`Lost: ${stats.dropped}`);
    }
    if (showPoints) {
        perfParts.push(`${pointsLabel}: ${stats.points ?? 0}`);
    }
    lines.push(perfParts.join(' | '));
    if (showDRT) {
        lines.push(`DRT Hits: ${drtStats?.hits ?? 0} | Misses: ${drtStats?.misses ?? 0}`);
    }
    if (focusInfo?.enabled) {
        if (focusInfo.ammoLabel) {
            lines.push(`Current cue: ${focusInfo.ammoLabel}`);
        }
    }
    return lines;
};
//# sourceMappingURL=hud.js.map