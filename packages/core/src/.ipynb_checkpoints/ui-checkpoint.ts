export interface TimedResponse {
  key: string | null;
  rtMs: number | null;
}

export interface CaptureTimedResponseArgs {
  allowedKeys: string[];
  totalDurationMs: number;
  startMs?: number;
  endMs?: number;
}

export interface ContinuePromptOptions {
  buttonId?: string;
  buttonLabel?: string;
}

export interface CenteredNoticeOptions {
  title: string;
  message?: string;
}

export interface FixedTrialFrameOptions {
  aperturePx: number;
  innerHtml?: string;
  cueHtml?: string | null;
  paddingYPx?: number;
  cueHeightPx?: number;
  cueMarginBottomPx?: number;
  canvasBackground?: string;
  canvasBorder?: string;
}

export interface CenteredMessageFrameOptions extends FixedTrialFrameOptions {
  message: string;
  messageColor?: string;
  fontSizePx?: number;
  fontWeight?: number;
}

export interface CanvasFrameLayoutOptions {
  aperturePx: number;
  paddingYPx?: number;
  cueHeightPx?: number;
  cueMarginBottomPx?: number;
}

export interface CanvasFrameLayout {
  aperturePx: number;
  paddingYPx: number;
  cueHeightPx: number;
  cueMarginBottomPx: number;
  frameTopPx: number;
  totalHeightPx: number;
}

export interface CanvasFrameDrawOptions {
  cueText?: string;
  cueColor?: string;
  frameBackground?: string;
  frameBorder?: string;
}

export interface CanvasFrameContentContext {
  ctx: CanvasRenderingContext2D;
  layout: CanvasFrameLayout;
  centerX: number;
  centerY: number;
  frameLeft: number;
  frameTop: number;
  frameSize: number;
}

export interface MountCanvasElementArgs {
  container: HTMLElement;
  width: number;
  height: number;
  wrapperClassName?: string;
  canvasClassName?: string;
}

export interface MountedCanvasElement {
  wrapper: HTMLDivElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export interface CanvasCenteredMessageOptions extends CanvasFrameDrawOptions {
  message: string;
  messageColor?: string;
  fontSizePx?: number;
  fontWeight?: number;
}

export interface CanvasHostHandle {
  stageShell: HTMLElement;
  container: HTMLElement;
  updateScale: () => void;
  dispose: () => void;
}

export interface CreateScaledCanvasHostArgs {
  displayElement: HTMLElement;
  canvasWidth: number;
  canvasHeight: number;
  viewportPaddingPx?: number;
}

const CANVAS_CENTER_STYLE_ID = "exp-jspsych-canvas-center-style";

export function normalizeKey(key: string): string {
  const k = String(key || "").toLowerCase();
  if (k === " " || k === "spacebar" || k === "space") return "space";
  return k;
}

export function toJsPsychKey(key: string): string {
  const normalized = normalizeKey(key);
  if (normalized === "space") return " ";
  return normalized;
}

export function toJsPsychChoices(keys: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const key of keys ?? []) {
    const mapped = toJsPsychKey(key);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    output.push(mapped);
  }
  return output;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, ms)));
}

export async function waitForContinue(
  container: HTMLElement,
  html: string,
  options: ContinuePromptOptions = {},
): Promise<void> {
  const buttonId = options.buttonId ?? "exp-continue-btn";
  const buttonLabel = options.buttonLabel ?? "Continue";
  container.innerHTML = `<div class="exp-continue-screen" style="width:100%;min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center;"><div class="exp-continue-body" style="max-width:900px;padding:0 1rem;">${html}<p class="exp-continue-actions" style="margin-top:1rem;"><button id="${buttonId}" class="exp-continue-btn" type="button">${escapeHtml(buttonLabel)}</button></p></div></div>`;
  const btn = container.querySelector(`#${buttonId}`);
  if (!(btn instanceof HTMLButtonElement)) return;
  await new Promise<void>((resolve) => {
    const onKey = (ev: KeyboardEvent) => {
      if (normalizeKey(ev.key) !== "space") return;
      cleanup();
      resolve();
    };
    const onClick = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      btn.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
    };
    btn.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    btn.focus();
  });
}

export function captureTimedResponse(args: CaptureTimedResponseArgs): Promise<TimedResponse> {
  const allowed = new Set((args.allowedKeys ?? []).map((key) => normalizeKey(key)));
  const totalDurationMs = Math.max(0, args.totalDurationMs);
  const startMs = Math.max(0, args.startMs ?? 0);
  const endMs = Math.max(startMs, args.endMs ?? totalDurationMs);

  return new Promise((resolve) => {
    let active = false;
    let captured: TimedResponse = { key: null, rtMs: null };
    const startAt = performance.now();

    const onKey = (ev: KeyboardEvent) => {
      if (!active) return;
      const key = normalizeKey(ev.key);
      if (!allowed.has(key)) return;
      if (captured.key) return;
      captured = { key, rtMs: Math.round(performance.now() - startAt) };
    };

    const onTimer = window.setTimeout(() => {
      cleanup();
      resolve(captured);
    }, totalDurationMs);
    const startTimer = window.setTimeout(() => {
      active = true;
    }, startMs);
    const endTimer = window.setTimeout(() => {
      active = false;
    }, endMs);

    window.addEventListener("keydown", onKey);

    const cleanup = () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(onTimer);
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
    };
  });
}

export function renderFixedTrialFrame(options: FixedTrialFrameOptions): string {
  const aperturePx = Math.max(40, Math.round(options.aperturePx));
  const cueHeightPx = Math.max(0, Math.round(options.cueHeightPx ?? 24));
  const cueMarginBottomPx = Math.max(0, Math.round(options.cueMarginBottomPx ?? 6));
  const paddingYPx = Math.max(0, Math.round(options.paddingYPx ?? 16));
  const cueHtml = options.cueHtml ?? "&nbsp;";
  const innerHtml = options.innerHtml ?? "";
  const canvasBackground = options.canvasBackground ?? "#000";
  const canvasBorder = options.canvasBorder ?? "2px solid #444";
  return `<div style="display:flex;justify-content:center;padding:${paddingYPx}px 0;"><div style="width:${aperturePx}px;"><div style="height:${cueHeightPx}px;display:flex;align-items:center;justify-content:center;margin-bottom:${cueMarginBottomPx}px;">${cueHtml}</div><div style="position:relative;width:${aperturePx}px;height:${aperturePx}px;background:${canvasBackground};border:${canvasBorder};">${innerHtml}</div></div></div>`;
}

export function renderCenteredMessageFrame(options: CenteredMessageFrameOptions): string {
  const color = options.messageColor ?? "#ffffff";
  const fontSizePx = Math.max(10, Math.round(options.fontSizePx ?? 28));
  const fontWeight = Math.max(300, Math.min(900, Math.round(options.fontWeight ?? 700)));
  const messageHtml = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${color};font-size:${fontSizePx}px;font-weight:${fontWeight};line-height:1.2;">${escapeHtml(options.message)}</div>`;
  return renderFixedTrialFrame({
    ...options,
    innerHtml: messageHtml,
  });
}

export function renderCenteredNotice(options: CenteredNoticeOptions): string {
  const title = escapeHtml(options.title);
  const message = options.message ? `<p>${escapeHtml(options.message)}</p>` : "";
  return `<div style="width:100%;min-height:50vh;display:flex;align-items:center;justify-content:center;text-align:center;"><div><h2>${title}</h2>${message}</div></div>`;
}

function parseBorder(value: string | undefined): { widthPx: number; color: string } {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?)px\s+\w+\s+(.+)$/i);
  if (!match) return { widthPx: 2, color: "#444444" };
  const widthPx = Number(match[1]);
  return {
    widthPx: Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 2,
    color: match[2].trim() || "#444444",
  };
}

export function computeCanvasFrameLayout(options: CanvasFrameLayoutOptions): CanvasFrameLayout {
  const aperturePx = Math.max(40, Math.round(options.aperturePx));
  const paddingYPx = Math.max(0, Math.round(options.paddingYPx ?? 16));
  const cueHeightPx = Math.max(0, Math.round(options.cueHeightPx ?? 24));
  const cueMarginBottomPx = Math.max(0, Math.round(options.cueMarginBottomPx ?? 6));
  const frameTopPx = paddingYPx + cueHeightPx + cueMarginBottomPx;
  const totalHeightPx = frameTopPx + aperturePx + paddingYPx;
  return {
    aperturePx,
    paddingYPx,
    cueHeightPx,
    cueMarginBottomPx,
    frameTopPx,
    totalHeightPx,
  };
}

export function drawCanvasTrialFrame(
  ctx: CanvasRenderingContext2D,
  layout: CanvasFrameLayout,
  options: CanvasFrameDrawOptions = {},
): void {
  const cueText = options.cueText ?? "";
  const cueColor = options.cueColor ?? "#0f172a";
  const frameBackground = options.frameBackground ?? "#000000";
  const frameBorder = options.frameBorder ?? "2px solid #444";
  const border = parseBorder(frameBorder);

  ctx.clearRect(0, 0, layout.aperturePx, layout.totalHeightPx);
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, layout.aperturePx, layout.totalHeightPx);

  if (cueText) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "16px sans-serif";
    ctx.fillStyle = cueColor;
    ctx.fillText(cueText, layout.aperturePx / 2, layout.paddingYPx + layout.cueHeightPx / 2);
  }

  ctx.fillStyle = frameBackground;
  ctx.fillRect(0, layout.frameTopPx, layout.aperturePx, layout.aperturePx);

  ctx.lineWidth = border.widthPx;
  ctx.strokeStyle = border.color;
  const inset = border.widthPx / 2;
  ctx.strokeRect(inset, layout.frameTopPx + inset, layout.aperturePx - border.widthPx, layout.aperturePx - border.widthPx);
}

export function drawCanvasFramedScene(
  ctx: CanvasRenderingContext2D,
  layout: CanvasFrameLayout,
  options: CanvasFrameDrawOptions,
  drawContent?: (args: CanvasFrameContentContext) => void,
): void {
  drawCanvasTrialFrame(ctx, layout, options);
  if (!drawContent) return;
  drawContent({
    ctx,
    layout,
    centerX: layout.aperturePx / 2,
    centerY: layout.frameTopPx + layout.aperturePx / 2,
    frameLeft: 0,
    frameTop: layout.frameTopPx,
    frameSize: layout.aperturePx,
  });
}

export function drawCanvasCenteredText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  options: { color?: string; fontSizePx?: number; fontWeight?: number } = {},
): void {
  const color = options.color ?? "#111111";
  const fontSizePx = Math.max(10, Math.round(options.fontSizePx ?? 28));
  const fontWeight = Math.max(300, Math.min(900, Math.round(options.fontWeight ?? 700)));
  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${fontSizePx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

export function drawCenteredCanvasMessage(
  ctx: CanvasRenderingContext2D,
  layout: CanvasFrameLayout,
  options: CanvasCenteredMessageOptions,
): void {
  drawCanvasTrialFrame(ctx, layout, options);
  const message = options.message ?? "";
  const messageColor = options.messageColor ?? "#ffffff";
  const fontSizePx = Math.max(10, Math.round(options.fontSizePx ?? 28));
  const fontWeight = Math.max(300, Math.min(900, Math.round(options.fontWeight ?? 700)));
  ctx.fillStyle = messageColor;
  ctx.font = `${fontWeight} ${fontSizePx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, layout.aperturePx / 2, layout.frameTopPx + layout.aperturePx / 2);
}

export function createScaledCanvasHost(args: CreateScaledCanvasHostArgs): CanvasHostHandle {
  const displayElement = args.displayElement;
  const canvasWidth = Math.max(40, Math.round(args.canvasWidth));
  const canvasHeight = Math.max(40, Math.round(args.canvasHeight));
  const viewportPaddingPx = Math.max(0, Math.round(args.viewportPaddingPx ?? 24));

  displayElement.innerHTML = "";
  const stageShell = document.createElement("div");
  stageShell.className = "exp-canvas-stage-shell";
  const container = document.createElement("div");
  container.className = "exp-canvas-container";
  stageShell.appendChild(container);
  displayElement.appendChild(stageShell);

  container.style.width = `${canvasWidth}px`;
  container.style.height = `${canvasHeight}px`;
  container.style.margin = "0";
  container.style.transformOrigin = "top left";

  const updateScale = () => {
    const bounds = displayElement.getBoundingClientRect();
    const availableWidth = Math.max(320, bounds.width - viewportPaddingPx * 2);
    const availableHeight = Math.max(240, bounds.height - viewportPaddingPx * 2);
    const scale = Math.min(1, availableWidth / canvasWidth, availableHeight / canvasHeight);
    const scaledWidth = Math.floor(canvasWidth * scale);
    const scaledHeight = Math.floor(canvasHeight * scale);
    container.style.transform = `scale(${scale})`;
    stageShell.style.width = `${scaledWidth}px`;
    stageShell.style.height = `${scaledHeight}px`;
    stageShell.style.maxWidth = "100%";
    stageShell.style.maxHeight = "100%";
    stageShell.style.overflow = "hidden";
  };

  updateScale();
  window.addEventListener("resize", updateScale);

  const dispose = () => {
    window.removeEventListener("resize", updateScale);
    displayElement.innerHTML = "";
  };

  return { stageShell, container, updateScale, dispose };
}

export function mountCanvasElement(args: MountCanvasElementArgs): MountedCanvasElement {
  const width = Math.max(40, Math.round(args.width));
  const height = Math.max(40, Math.round(args.height));
  const container = args.container;
  container.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = args.wrapperClassName ?? "exp-canvas-wrapper";
  wrapper.style.display = "flex";
  wrapper.style.justifyContent = "center";

  const canvas = document.createElement("canvas");
  canvas.className = args.canvasClassName ?? "exp-canvas";
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create 2D canvas context.");
  }
  return { wrapper, canvas, ctx };
}

export function ensureJsPsychCanvasCentered(container: HTMLElement): void {
  if (!document.getElementById(CANVAS_CENTER_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = CANVAS_CENTER_STYLE_ID;
    style.textContent = `
.exp-jspsych-canvas-centered .jspsych-content-wrapper,
.exp-jspsych-canvas-centered .jspsych-content {
  width: 100%;
}
.exp-jspsych-canvas-centered .jspsych-content {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
.exp-jspsych-canvas-centered #jspsych-canvas-keyboard-response-stimulus {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  min-height: 100%;
}
.exp-jspsych-canvas-centered #jspsych-canvas-stimulus {
  display: block;
  margin: 0 auto;
}
`;
    document.head.appendChild(style);
  }
  container.classList.add("exp-jspsych-canvas-centered");
}

export function resolveJsPsychContentHost(container: HTMLElement): HTMLElement {
  const host = container.querySelector<HTMLElement>(".jspsych-content");
  return host ?? container;
}

export function pushJsPsychContinueScreen(
  timeline: any[],
  plugin: unknown,
  container: HTMLElement,
  html: string,
  phase: string,
  buttonId: string,
  data: Record<string, unknown> = {},
): void {
  timeline.push({
    type: plugin,
    data: {
      phase,
      ...data,
    },
    async: true,
    func: (done: () => void) => {
      const host = resolveJsPsychContentHost(container);
      void waitForContinue(host, html, { buttonId }).then(done);
    },
  });
}
