#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

function printUsage() {
  console.log(`Usage:
  node scripts/run-autoresponder-url.mjs --url "<jatos-link>" [options]

Options:
  --max-minutes <n>        Max wall time (default: 120)
  --goto-timeout-ms <n>    Initial navigation timeout in ms (default: 120000)
  --done-selector <css>    Completion selector to wait for
  --done-text "<text>"     Completion body text snippet to wait for
  --artifact-dir <path>    Directory for logs/screenshots
  --headful                Run with visible browser (default is headless)
  --slow-mo-ms <n>         Slow motion between Playwright actions
  --no-force-auto          Do not inject auto=true when missing`);
}

function parseArgs(argv) {
  const out = {
    url: "",
    maxMinutes: 120,
    gotoTimeoutMs: 120_000,
    doneSelector: "",
    doneText: "",
    artifactDir: "",
    headful: false,
    slowMoMs: 0,
    forceAuto: true,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith("--")) {
      positional.push(key);
      continue;
    }
    if (key === "--help" || key === "-h") {
      printUsage();
      process.exit(0);
    }
    if (key === "--url" && next) {
      out.url = String(next);
      i += 1;
      continue;
    }
    if (key === "--max-minutes" && next) {
      out.maxMinutes = Number(next);
      i += 1;
      continue;
    }
    if (key === "--goto-timeout-ms" && next) {
      out.gotoTimeoutMs = Number(next);
      i += 1;
      continue;
    }
    if (key === "--done-selector" && next) {
      out.doneSelector = String(next);
      i += 1;
      continue;
    }
    if (key === "--done-text" && next) {
      out.doneText = String(next);
      i += 1;
      continue;
    }
    if (key === "--artifact-dir" && next) {
      out.artifactDir = String(next);
      i += 1;
      continue;
    }
    if (key === "--headful") {
      out.headful = true;
      continue;
    }
    if (key === "--slow-mo-ms" && next) {
      out.slowMoMs = Number(next);
      i += 1;
      continue;
    }
    if (key === "--no-force-auto") {
      out.forceAuto = false;
      continue;
    }
  }

  // Positional fallback for npm-run invocations where flags are not forwarded.
  // Format: <url> [maxMinutes] [doneText...]
  if (!out.url && positional.length > 0) {
    out.url = positional[0];
  }
  if (positional.length > 1) {
    const maybeMinutes = Number(positional[1]);
    if (Number.isFinite(maybeMinutes)) {
      out.maxMinutes = maybeMinutes;
    }
  }
  if (!out.doneText && positional.length > 2) {
    out.doneText = positional.slice(2).join(" ");
  }

  return out;
}

function withAutoParam(rawUrl, forceAuto) {
  const parsed = new URL(rawUrl);
  if (forceAuto && !parsed.searchParams.has("auto")) {
    parsed.searchParams.set("auto", "true");
  }
  return parsed.toString();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function saveArtifacts(page, artifactDir, label) {
  const safe = label.replace(/[^a-z0-9_-]/gi, "_");
  await page.screenshot({ path: path.join(artifactDir, `${safe}.png`), fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  if (html) {
    await fs.writeFile(path.join(artifactDir, `${safe}.html`), html, "utf8");
  }
}

async function pageHasDoneSignal(page, doneSelector, doneText) {
  if (doneSelector) {
    const count = await page.locator(doneSelector).count().catch(() => 0);
    if (count > 0) return true;
  }
  const textSignal = doneText || "";
  if (textSignal) {
    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (bodyText.toLowerCase().includes(textSignal.toLowerCase())) return true;
  }
  if (!doneSelector && !doneText) {
    const bodyText = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    const genericDone = /(task complete|study complete|thank you very much for participating|that concludes the experiment|sft complete)/i;
    if (genericDone.test(bodyText)) return true;
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    printUsage();
    process.exit(1);
  }

  const runUrl = withAutoParam(args.url, args.forceAuto);
  const startedAt = Date.now();
  const maxMs = Math.max(60_000, Math.round(args.maxMinutes * 60_000));
  const artifactDir =
    args.artifactDir ||
    path.resolve(process.cwd(), "temp", "autoresponder-runs", new Date().toISOString().replace(/[:.]/g, "-"));

  await ensureDir(artifactDir);
  await fs.writeFile(path.join(artifactDir, "meta.json"), JSON.stringify({ runUrl, args, startedAt }, null, 2), "utf8");

  const browser = await chromium.launch({
    headless: !args.headful,
    slowMo: Math.max(0, args.slowMoMs),
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion,BackForwardCache",
    ],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const line = `[console:${msg.type()}] ${msg.text()}`;
    console.log(line);
  });
  page.on("pageerror", (err) => {
    console.error(`[pageerror] ${String(err)}`);
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure();
    console.error(`[requestfailed] ${req.method()} ${req.url()} ${failure?.errorText || ""}`);
  });
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 400) {
      const req = res.request();
      console.error(`[response:${status}] ${req.method()} ${res.url()}`);
    }
  });

  console.log(`Launching: ${runUrl}`);
  await page.goto(runUrl, { waitUntil: "domcontentloaded", timeout: args.gotoTimeoutMs });

  let lastHeartbeatMs = 0;
  try {
    while (true) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > maxMs) {
        await saveArtifacts(page, artifactDir, "timeout");
        throw new Error(`Timed out after ${(elapsed / 1000).toFixed(1)}s`);
      }

      if (await pageHasDoneSignal(page, args.doneSelector, args.doneText)) {
        await saveArtifacts(page, artifactDir, "complete");
        const summary = {
          status: "completed",
          elapsedMs: elapsed,
          finalUrl: page.url(),
          finishedAt: Date.now(),
        };
        await fs.writeFile(path.join(artifactDir, "result.json"), JSON.stringify(summary, null, 2), "utf8");
        console.log(`Completed in ${(elapsed / 1000).toFixed(1)}s`);
        console.log(`Artifacts: ${artifactDir}`);
        await browser.close();
        process.exit(0);
      }

      if (elapsed - lastHeartbeatMs >= 60_000) {
        lastHeartbeatMs = elapsed;
        console.log(`Heartbeat: ${(elapsed / 1000).toFixed(0)}s elapsed, url=${page.url()}`);
      }

      await page.waitForTimeout(1000);
    }
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const summary = {
      status: "failed",
      elapsedMs: elapsed,
      finalUrl: page.url(),
      error: String(error),
      finishedAt: Date.now(),
    };
    await fs.writeFile(path.join(artifactDir, "result.json"), JSON.stringify(summary, null, 2), "utf8");
    console.error(String(error));
    console.error(`Artifacts: ${artifactDir}`);
    await browser.close();
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(2);
});
