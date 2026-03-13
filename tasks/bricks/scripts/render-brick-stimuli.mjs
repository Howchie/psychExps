#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

function parseArgs(argv) {
  const out = {
    styles: ["present"],
    outputDir: path.join(repoRoot, "apps/web/public/assets/bricks-stimuli"),
    mode: "brick",
    host: "127.0.0.1",
    port: 5173,
    variant: "baseline",
    canvasWidth: 1000,
    canvasHeight: 520,
    beltHeight: 72,
    beltGap: 24,
    brickWidth: 220,
    brickHeight: 54,
    pixelPadding: 16,
    headful: false,
    keepServer: false,
    timeoutMs: 60_000,
  };

  const asList = (value) =>
    String(value)
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith("--")) continue;
    if (key === "--styles" && next) {
      out.styles = asList(next);
      i += 1;
      continue;
    }
    if (key === "--output-dir" && next) {
      out.outputDir = path.isAbsolute(next)
        ? next
        : path.resolve(repoRoot, next);
      i += 1;
      continue;
    }
    if (key === "--mode" && next) {
      out.mode = next === "scene" ? "scene" : "brick";
      i += 1;
      continue;
    }
    if (key === "--host" && next) {
      out.host = String(next);
      i += 1;
      continue;
    }
    if (key === "--port" && next) {
      out.port = Number(next);
      i += 1;
      continue;
    }
    if (key === "--variant" && next) {
      out.variant = String(next);
      i += 1;
      continue;
    }
    if (key === "--canvas-width" && next) {
      out.canvasWidth = Number(next);
      i += 1;
      continue;
    }
    if (key === "--canvas-height" && next) {
      out.canvasHeight = Number(next);
      i += 1;
      continue;
    }
    if (key === "--belt-height" && next) {
      out.beltHeight = Number(next);
      i += 1;
      continue;
    }
    if (key === "--belt-gap" && next) {
      out.beltGap = Number(next);
      i += 1;
      continue;
    }
    if (key === "--brick-width" && next) {
      out.brickWidth = Number(next);
      i += 1;
      continue;
    }
    if (key === "--brick-height" && next) {
      out.brickHeight = Number(next);
      i += 1;
      continue;
    }
    if (key === "--pixel-padding" && next) {
      out.pixelPadding = Number(next);
      i += 1;
      continue;
    }
    if (key === "--headful") {
      out.headful = true;
      continue;
    }
    if (key === "--keep-server") {
      out.keepServer = true;
      continue;
    }
    if (key === "--timeout-ms" && next) {
      out.timeoutMs = Number(next);
      i += 1;
      continue;
    }
  }

  if (!out.styles.length) {
    throw new Error("No styles specified. Use --styles present,crate");
  }
  return out;
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(400);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      resolve(false);
    });
  });
}

async function waitForPort(host, port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await isPortOpen(host, port)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${host}:${port} after ${timeoutMs} ms`);
}

async function maybeStartDevServer(opts) {
  const alreadyUp = await isPortOpen(opts.host, opts.port);
  if (alreadyUp) return { owned: false, proc: null };

  const proc = spawn("npm", ["run", "dev", "-w", "@experiments/web"], {
    cwd: repoRoot,
    stdio: "pipe",
    env: { ...process.env },
  });
  proc.stdout?.on("data", (chunk) => process.stdout.write(String(chunk)));
  proc.stderr?.on("data", (chunk) => process.stderr.write(String(chunk)));
  await waitForPort(opts.host, opts.port, opts.timeoutMs);
  return { owned: true, proc };
}

function buildOverrides(style, opts) {
  const beltHeight = Math.max(8, Number(opts.beltHeight));
  const brickWidth = Math.max(8, Number(opts.brickWidth));
  const brickHeight = Math.max(8, Number(opts.brickHeight));
  const canvasWidth = Math.max(200, Number(opts.canvasWidth));
  const canvasHeight = Math.max(160, Number(opts.canvasHeight));
  const conveyorLength = Math.max(brickWidth + 40, Math.floor(canvasWidth * 0.78));
  const brickX = Math.max(0, Math.floor((conveyorLength - brickWidth) * 0.5));

  return {
    task: {
      title: `Bricks Stimulus Capture (${style})`,
    },
    display: {
      canvasWidth,
      canvasHeight,
      beltHeight,
      beltGap: Math.max(0, Number(opts.beltGap)),
      brickHeight,
      dueDateMarker: { enable: false },
      endFurnace: { enable: false },
      ui: {
        showHUD: false,
        showTimer: false,
        showDroppedBlocks: false,
        showPoints: false,
        showDRT: false,
      },
    },
    conveyors: {
      nConveyors: 1,
      lengthPx: conveyorLength,
      speedPxPerSec: { type: "fixed", value: 0 },
    },
    bricks: {
      completionMode: "single_click",
      initialBricks: { type: "fixed", value: 0 },
      forcedSet: [
        {
          conveyorIndex: 0,
          x: brickX,
          width: brickWidth,
          textureStyle: style,
          label: style,
        },
      ],
      maxBricksPerTrial: 1,
      spawn: {
        ratePerSec: { type: "fixed", value: 0 },
        interSpawnDist: null,
        minSpacingPx: 0,
        byConveyor: true,
        maxActivePerConveyor: 1,
      },
    },
    trial: {
      mode: "fixed_time",
      maxTimeSec: 600,
    },
    experiment: {
      startTrialsOn: "immediate",
    },
    blocks: [{ label: "Capture", trials: 1, manipulation: "capture" }],
    manipulations: [{ id: "capture", overrides: {} }],
    instructions: {
      introPages: [],
      blockIntroPages: [],
      endPages: [],
    },
  };
}

function getBrickClip(opts) {
  const canvasWidth = Math.max(200, Number(opts.canvasWidth));
  const canvasHeight = Math.max(160, Number(opts.canvasHeight));
  const beltHeight = Math.max(8, Number(opts.beltHeight));
  const brickWidth = Math.max(8, Number(opts.brickWidth));
  const brickHeight = Math.max(8, Number(opts.brickHeight));
  const conveyorLength = Math.max(brickWidth + 40, Math.floor(canvasWidth * 0.78));
  const brickX = Math.max(0, Math.floor((conveyorLength - brickWidth) * 0.5));
  const topOffset = (canvasHeight - beltHeight) / 2;
  const brickY = topOffset + (beltHeight - brickHeight) / 2;
  const pad = Math.max(0, Number(opts.pixelPadding));

  return {
    x: Math.max(0, Math.floor(brickX - pad)),
    y: Math.max(0, Math.floor(brickY - pad)),
    width: Math.min(canvasWidth, Math.ceil(brickWidth + pad * 2)),
    height: Math.min(canvasHeight, Math.ceil(brickHeight + pad * 2)),
  };
}

function ensureWithinCanvas(clip, canvasBounds) {
  const x = Math.max(canvasBounds.x, Math.min(canvasBounds.x + canvasBounds.width - 1, clip.x));
  const y = Math.max(canvasBounds.y, Math.min(canvasBounds.y + canvasBounds.height - 1, clip.y));
  const width = Math.max(
    1,
    Math.min(clip.width, Math.floor(canvasBounds.x + canvasBounds.width - x))
  );
  const height = Math.max(
    1,
    Math.min(clip.height, Math.floor(canvasBounds.y + canvasBounds.height - y))
  );
  return { x, y, width, height };
}

async function findTrialCanvas(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector(".exp-continue-btn");
      if (btn) return false;
      const canvas = document.querySelector(".exp-canvas-container canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return false;
      const rect = canvas.getBoundingClientRect();
      return rect.width > 2 && rect.height > 2;
    },
    { timeout: timeoutMs }
  );
  const handle = await page.locator(".exp-canvas-container canvas").first().elementHandle();
  if (!handle) {
    throw new Error("Bricks trial canvas not found (.exp-canvas-container canvas).");
  }
  return handle;
}

function sanitizeFilePart(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
}

async function captureStyle(page, style, opts) {
  const overrides = buildOverrides(style, opts);
  const url = new URL(`http://${opts.host}:${opts.port}/`);
  url.searchParams.set("task", "bricks");
  url.searchParams.set("variant", opts.variant);
  url.searchParams.set("auto", "true");
  url.searchParams.set("overrides", JSON.stringify(overrides));

  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
  const canvasHandle = await findTrialCanvas(page, opts.timeoutMs);
  await page.waitForTimeout(350);

  const box = await canvasHandle.boundingBox();
  if (!box) {
    throw new Error(`Failed to locate canvas bounds for style '${style}'`);
  }
  const fullClip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.floor(box.width),
    height: Math.floor(box.height),
  };
  const worldBrickClip = getBrickClip(opts);
  const scaleX = box.width / Math.max(1, Number(opts.canvasWidth));
  const scaleY = box.height / Math.max(1, Number(opts.canvasHeight));

  const canvasClip =
    opts.mode === "scene"
      ? fullClip
      : ensureWithinCanvas(
          {
            x: Math.floor(box.x + worldBrickClip.x * scaleX),
            y: Math.floor(box.y + worldBrickClip.y * scaleY),
            width: Math.max(1, Math.ceil(worldBrickClip.width * scaleX)),
            height: Math.max(1, Math.ceil(worldBrickClip.height * scaleY)),
          },
          fullClip
        );

  const outName = `${sanitizeFilePart(style)}.${opts.mode}.png`;
  const outPath = path.join(opts.outputDir, outName);
  await page.screenshot({
    path: outPath,
    clip: canvasClip,
  });
  return outPath;
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  await fs.mkdir(opts.outputDir, { recursive: true });
  process.stdout.write(`Output dir: ${opts.outputDir}\n`);
  const server = await maybeStartDevServer(opts);

  let browser = null;
  try {
    browser = await chromium.launch({ headless: !opts.headful });
    const context = await browser.newContext({
      viewport: { width: 1800, height: 1200 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const outputs = [];
    for (const style of opts.styles) {
      const outPath = await captureStyle(page, style, opts);
      outputs.push(outPath);
      process.stdout.write(`Wrote ${outPath}\n`);
    }
    await context.close();
    if (outputs.length === 0) {
      throw new Error("No images were written.");
    }
  } finally {
    if (browser) await browser.close();
    if (server.owned && server.proc && !opts.keepServer) {
      server.proc.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
