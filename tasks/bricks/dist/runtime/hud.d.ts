/**
 * Formats HUD copy so the renderer can stay focused on drawing.
 */
export declare const buildHUDLines: ({ stats, remainingMs, blockLabel, drtStats, focusInfo, uiConfig, drtEnabled }: {
    stats: any;
    remainingMs: any;
    blockLabel: any;
    drtStats: any;
    focusInfo: any;
    uiConfig?: {} | undefined;
    drtEnabled?: boolean | undefined;
}) => string[];
