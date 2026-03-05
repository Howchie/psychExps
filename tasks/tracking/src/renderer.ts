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

interface PointerWiring {
  pointer: PointerState;
  consumeClicks: () => PointerClick[];
  teardown: () => void;
}

function wirePointerEvents(element: HTMLElement): PointerWiring {
  const pointer: PointerState = { x: null, y: null };
  const clicks: PointerClick[] = [];

  const updateMouse = (event: MouseEvent): void => {
    const rect = element.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
  };
  const updateTouch = (event: TouchEvent): void => {
    if (event.touches.length <= 0) return;
    const rect = element.getBoundingClientRect();
    pointer.x = event.touches[0].clientX - rect.left;
    pointer.y = event.touches[0].clientY - rect.top;
  };
  const clearPointer = (): void => {
    pointer.x = null;
    pointer.y = null;
  };
  const onClick = (event: MouseEvent): void => {
    const rect = element.getBoundingClientRect();
    clicks.push({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      timeMs: performance.now(),
    });
  };
  const onTouchEnd = (event: TouchEvent): void => {
    if (event.changedTouches.length <= 0) return;
    const rect = element.getBoundingClientRect();
    clicks.push({
      x: event.changedTouches[0].clientX - rect.left,
      y: event.changedTouches[0].clientY - rect.top,
      timeMs: performance.now(),
    });
    clearPointer();
  };

  element.addEventListener("mousemove", updateMouse);
  element.addEventListener("mouseleave", clearPointer);
  element.addEventListener("touchstart", updateTouch, { passive: true });
  element.addEventListener("touchmove", updateTouch, { passive: true });
  element.addEventListener("touchend", onTouchEnd, { passive: true });
  element.addEventListener("click", onClick);

  return {
    pointer,
    consumeClicks: () => {
      if (clicks.length === 0) return [];
      const out = clicks.slice();
      clicks.length = 0;
      return out;
    },
    teardown: () => {
      element.removeEventListener("mousemove", updateMouse);
      element.removeEventListener("mouseleave", clearPointer);
      element.removeEventListener("touchstart", updateTouch);
      element.removeEventListener("touchmove", updateTouch);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("click", onClick);
    },
  };
}

function drawCrosshairCanvas(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

function drawPursuitTargetCanvas(ctx: CanvasRenderingContext2D, frame: PursuitRenderFrame): void {
  ctx.fillStyle = frame.fillColor;
  ctx.strokeStyle = frame.strokeColor;
  ctx.lineWidth = frame.strokeWidthPx;

  if (frame.target.shape === "circle") {
    ctx.beginPath();
    ctx.arc(frame.target.centerX, frame.target.centerY, frame.target.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }

  const half = frame.target.sizePx / 2;
  ctx.beginPath();
  ctx.rect(frame.target.centerX - half, frame.target.centerY - half, frame.target.sizePx, frame.target.sizePx);
  ctx.fill();
  ctx.stroke();
}

function drawMotCanvas(ctx: CanvasRenderingContext2D, width: number, frame: MotRenderFrame): void {
  for (const dot of frame.dots) {
    ctx.fillStyle = dot.fillColor;
    ctx.strokeStyle = dot.strokeColor;
    ctx.lineWidth = dot.strokeWidthPx;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (frame.promptText) {
    ctx.fillStyle = frame.promptColor ?? "#f8fafc";
    ctx.font = `${Math.max(12, Math.round(frame.promptFontPx ?? 22))}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(frame.promptText, width / 2, 16);
  }
}

function createCanvasRenderer(host: HTMLElement, config: TrackingRendererConfig): TrackingRenderer {
  host.innerHTML = "";

  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  canvas.style.width = `${config.width}px`;
  canvas.style.height = `${config.height}px`;
  canvas.style.cursor = "crosshair";
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Tracking canvas 2D context unavailable.");
  }

  const pointerWiring = wirePointerEvents(canvas);

  const beginFrame = () => {
    ctx.clearRect(0, 0, config.width, config.height);
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, config.width, config.height);
    if (config.showCrosshair) {
      drawCrosshairCanvas(ctx, config.width, config.height);
    }
  };

  return {
    pointer: pointerWiring.pointer,
    consumeClicks: pointerWiring.consumeClicks,
    setCursorStyle: (style) => {
      canvas.style.cursor = style;
    },
    renderPursuit: (frame) => {
      beginFrame();
      drawPursuitTargetCanvas(ctx, frame);
    },
    renderMot: (frame) => {
      beginFrame();
      drawMotCanvas(ctx, config.width, frame);
    },
    destroy: () => {
      pointerWiring.teardown();
      host.innerHTML = "";
    },
  };
}

async function createPixiRenderer(host: HTMLElement, config: TrackingRendererConfig): Promise<TrackingRenderer> {
  const PIXI = await import("pixi.js");
  host.innerHTML = "";

  const toColor = (value: string): number => {
    return PIXI.Color.shared.setValue(value || "#ffffff").toNumber();
  };

  const app = new PIXI.Application({
    width: config.width,
    height: config.height,
    backgroundColor: toColor(config.backgroundColor),
    antialias: true,
    autoDensity: true,
    resolution: Math.max(1, Math.min(window.devicePixelRatio || 1, 2)),
  });

  const view = (app.view || (app as unknown as { canvas?: HTMLCanvasElement }).canvas) as HTMLCanvasElement | undefined;
  if (!view) {
    throw new Error("Pixi renderer canvas unavailable.");
  }
  view.style.width = `${config.width}px`;
  view.style.height = `${config.height}px`;
  view.style.cursor = "crosshair";
  host.appendChild(view);

  const layer = new PIXI.Graphics();
  app.stage.addChild(layer);
  let promptText: InstanceType<typeof PIXI.Text> | null = null;

  const pointerWiring = wirePointerEvents(view);

  const beginFrame = () => {
    layer.clear();
    layer.beginFill(toColor(config.backgroundColor), 1);
    layer.drawRect(0, 0, config.width, config.height);
    layer.endFill();

    if (config.showCrosshair) {
      layer.lineStyle(1, toColor("#94a3b8"), 0.35);
      layer.moveTo(config.width / 2, 0);
      layer.lineTo(config.width / 2, config.height);
      layer.moveTo(0, config.height / 2);
      layer.lineTo(config.width, config.height / 2);
    }
  };

  const syncPrompt = (frame: MotRenderFrame) => {
    if (!frame.promptText) {
      if (promptText) {
        app.stage.removeChild(promptText);
        promptText.destroy();
        promptText = null;
      }
      return;
    }
    if (!promptText) {
      promptText = new PIXI.Text(frame.promptText, {
        fontFamily: "system-ui",
        fontSize: Math.max(12, Math.round(frame.promptFontPx ?? 22)),
        fill: toColor(frame.promptColor ?? "#f8fafc"),
        align: "center",
      });
      promptText.anchor.set(0.5, 0);
      promptText.x = config.width / 2;
      promptText.y = 16;
      app.stage.addChild(promptText);
      return;
    }
    promptText.text = frame.promptText;
    promptText.style.fontSize = Math.max(12, Math.round(frame.promptFontPx ?? 22));
    promptText.style.fill = toColor(frame.promptColor ?? "#f8fafc");
    promptText.x = config.width / 2;
    promptText.y = 16;
  };

  return {
    pointer: pointerWiring.pointer,
    consumeClicks: pointerWiring.consumeClicks,
    setCursorStyle: (style) => {
      view.style.cursor = style;
    },
    renderPursuit: (frame) => {
      beginFrame();
      layer.lineStyle(frame.strokeWidthPx, toColor(frame.strokeColor), 1);
      layer.beginFill(toColor(frame.fillColor), 1);

      if (frame.target.shape === "circle") {
        layer.drawCircle(frame.target.centerX, frame.target.centerY, frame.target.radiusPx);
      } else {
        const half = frame.target.sizePx / 2;
        layer.drawRect(frame.target.centerX - half, frame.target.centerY - half, frame.target.sizePx, frame.target.sizePx);
      }
      layer.endFill();
      syncPrompt({ dots: [] });
    },
    renderMot: (frame) => {
      beginFrame();
      for (const dot of frame.dots) {
        layer.lineStyle(dot.strokeWidthPx, toColor(dot.strokeColor), 1);
        layer.beginFill(toColor(dot.fillColor), 1);
        layer.drawCircle(dot.x, dot.y, dot.radiusPx);
        layer.endFill();
      }
      syncPrompt(frame);
    },
    destroy: () => {
      pointerWiring.teardown();
      if (promptText) {
        app.stage.removeChild(promptText);
        promptText.destroy();
        promptText = null;
      }
      app.destroy(true, { children: true } as any);
      host.innerHTML = "";
    },
  };
}

export async function createTrackingRenderer(host: HTMLElement, config: TrackingRendererConfig): Promise<TrackingRenderer> {
  if (config.backend === "pixi") {
    try {
      return await createPixiRenderer(host, config);
    } catch (error) {
      console.warn("Pixi backend unavailable for tracking; falling back to canvas.", error);
    }
  }
  return createCanvasRenderer(host, config);
}
