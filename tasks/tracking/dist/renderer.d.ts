import type { TrackingTargetGeometry } from "@experiments/core";
export type TrackingRendererBackend = "canvas" | "pixi";
export interface TrackingRendererConfig {
    backend: TrackingRendererBackend;
    width: number;
    height: number;
    backgroundColor: string;
    showCrosshair: boolean;
}
export interface PointerClick {
    x: number;
    y: number;
    timeMs: number;
}
export interface PointerState {
    x: number | null;
    y: number | null;
}
export interface PursuitRenderFrame {
    target: TrackingTargetGeometry;
    fillColor: string;
    strokeColor: string;
    strokeWidthPx: number;
}
export interface MotRenderDot {
    x: number;
    y: number;
    radiusPx: number;
    fillColor: string;
    strokeColor: string;
    strokeWidthPx: number;
}
export interface MotRenderFrame {
    dots: MotRenderDot[];
    promptText?: string;
    promptColor?: string;
    promptFontPx?: number;
}
export interface TrackingRenderer {
    pointer: PointerState;
    consumeClicks: () => PointerClick[];
    setCursorStyle: (style: string) => void;
    renderPursuit: (frame: PursuitRenderFrame) => void;
    renderMot: (frame: MotRenderFrame) => void;
    destroy: () => void;
}
export declare function createTrackingRenderer(host: HTMLElement, config: TrackingRendererConfig): Promise<TrackingRenderer>;
