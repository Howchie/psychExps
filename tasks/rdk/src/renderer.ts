import type { RdkDotMode } from "./index";

export type RdkRendererBackend = "canvas" | "pixi";

export interface RdkRendererConfig {
  backend: RdkRendererBackend;
  width: number;
  height: number;
  backgroundColor: string;
}

export interface RdkDot {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  isCoherent: boolean;
  color?: string;
}

export interface RdkRenderFrame {
  dots: RdkDot[];
  dotSizePx: number;
  dotColor: string;
  dotColorAlternate?: string;
  mode: RdkDotMode;
}

export interface RdkRenderer {
  render: (frame: RdkRenderFrame) => void;
  destroy: () => void;
}

function createCanvasRenderer(host: HTMLElement, config: RdkRendererConfig): RdkRenderer {
  host.innerHTML = "";

  const canvas = document.createElement("canvas");
  canvas.width = config.width;
  canvas.height = config.height;
  canvas.style.width = `${config.width}px`;
  canvas.style.height = `${config.height}px`;
  host.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("RDK canvas 2D context unavailable.");
  }

  const beginFrame = () => {
    ctx.clearRect(0, 0, config.width, config.height);
    // Note: Aperture is circular, background handled by container CSS usually
    // but we can fill here if needed.
  };

  return {
    render: (frame) => {
      beginFrame();
      const halfSize = frame.dotSizePx / 2;
      
      if (frame.mode === "dynamic") {
        ctx.fillStyle = frame.dotColor;
        for (const dot of frame.dots) {
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, halfSize, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (const dot of frame.dots) {
          ctx.fillStyle = dot.color || frame.dotColor;
          ctx.fillRect(dot.x - halfSize, dot.y - halfSize, frame.dotSizePx, frame.dotSizePx);
        }
      }
    },
    destroy: () => {
      host.innerHTML = "";
    },
  };
}

async function createPixiRenderer(host: HTMLElement, config: RdkRendererConfig): Promise<RdkRenderer> {
  const PIXI = await import("pixi.js");
  host.innerHTML = "";

  const toColor = (value: string): number => {
    return PIXI.Color.shared.setValue(value || "#ffffff").toNumber();
  };

  const app = new PIXI.Application({
    width: config.width,
    height: config.height,
    backgroundAlpha: 0, // Let CSS handle the background
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
  host.appendChild(view);

  const container = new PIXI.Container();
  app.stage.addChild(container);

  // For dynamic mode, we use a single Graphics object for all dots of the same color
  const dynamicGraphics = new PIXI.Graphics();
  container.addChild(dynamicGraphics);

  // For static mode, we might need different colors per dot
  const staticGraphics = new PIXI.Graphics();
  container.addChild(staticGraphics);

  return {
    render: (frame) => {
      dynamicGraphics.clear();
      staticGraphics.clear();

      const halfSize = frame.dotSizePx / 2;

      if (frame.mode === "dynamic") {
        dynamicGraphics.beginFill(toColor(frame.dotColor));
        for (const dot of frame.dots) {
          dynamicGraphics.drawCircle(dot.x, dot.y, halfSize);
        }
        dynamicGraphics.endFill();
      } else {
        // Static mode: dots can have different colors
        for (const dot of frame.dots) {
          staticGraphics.beginFill(toColor(dot.color || frame.dotColor));
          staticGraphics.drawRect(dot.x - halfSize, dot.y - halfSize, frame.dotSizePx, frame.dotSizePx);
          staticGraphics.endFill();
        }
      }
    },
    destroy: () => {
      app.destroy(true, { children: true } as any);
      host.innerHTML = "";
    },
  };
}

export async function createRdkRenderer(host: HTMLElement, config: RdkRendererConfig): Promise<RdkRenderer> {
  if (config.backend === "pixi") {
    try {
      return await createPixiRenderer(host, config);
    } catch (error) {
      console.warn("Pixi backend unavailable for RDK; falling back to canvas.", error);
    }
  }
  return createCanvasRenderer(host, config);
}
