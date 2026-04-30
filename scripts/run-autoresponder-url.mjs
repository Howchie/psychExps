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
  --start-selector <css>   Explicit selector to click to launch from JATOS start page
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
    startSelector: "",
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
    if (key === "--start-selector" && next) {
      out.startSelector = String(next);
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

function isPublixUrl(url) {
  return /\/publix\//i.test(String(url || ""));
}

function isPublixFinalUrl(url) {
  return /\/publix\/[^/]+\/final\//i.test(String(url || ""));
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

async function hasVisibleAdvanceControl(page) {
  const selectors = [
    '.exp-continue-btn[data-action="continue"]',
    'button[data-action="continue"]',
    'button:has-text("Continue")',
    'button:has-text("Next")',
    'button:has-text("Done")',
    'button:has-text("Submit")',
    'button:has-text("Finish")',
    'a:has-text("Continue")',
    'a:has-text("Next")',
    'a:has-text("Done")',
    'input[type="submit"]'
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;
    const enabled = await locator.isEnabled().catch(() => false);
    if (!enabled) continue;
    const text = (await locator.innerText().catch(() => "")).trim().toLowerCase();
    const action = (await locator.getAttribute("data-action").catch(() => "")) || "";
    if (action === "exit") continue;
    if (text.includes("disagree")) continue;
    if (text.includes("exit")) continue;
    return true;
  }
  return false;
}

async function clickLaunchIfNeeded(page, startSelector) {
  const currentUrl = page.url();
  const isJatosStart = /\/publix\/.+\/start(\?|$)/i.test(currentUrl);
  if (!isJatosStart) return false;

  const selectors = [];
  if (startSelector) selectors.push(startSelector);
  selectors.push(
    'button:has-text("Start")',
    'button:has-text("Begin")',
    'button:has-text("Continue")',
    'button:has-text("Done")',
    'button:has-text("Finish")',
    'a:has-text("Start")',
    'a:has-text("Begin")',
    'a:has-text("Continue")',
    'a:has-text("Done")',
    'input[type="submit"]'
  );

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;
    const enabled = await locator.isEnabled().catch(() => false);
    if (!enabled) continue;
    console.log(`Clicking launch control: ${selector}`);
    await locator.click({ timeout: 10_000 }).catch(() => {});
    return true;
  }
  return false;
}

async function clickFullscreenGateIfNeeded(page) {
  const currentUrl = page.url();
  if (!/jatos|publix/i.test(currentUrl)) return false;
  const bodyText = (await page.evaluate(() => document.body?.innerText || "").catch(() => "")).toLowerCase();
  const looksLikeFullscreenGate =
    bodyText.includes("fullscreen") ||
    bodyText.includes("full screen");
  if (!looksLikeFullscreenGate) return false;

  const selectors = [
    'button:has-text("Start in Fullscreen")',
    'button:has-text("Start in full screen")',
    'button:has-text("Enter Fullscreen")',
    'button:has-text("Enter full screen")',
    'button:has-text("Fullscreen")',
    'button:has-text("Full screen")',
    'button:has-text("Start")',
    'button:has-text("Continue")',
    'a:has-text("Start")',
    'a:has-text("Continue")',
    'input[type="submit"]'
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;
    const enabled = await locator.isEnabled().catch(() => false);
    if (!enabled) continue;
    console.log(`Clicking fullscreen/start gate: ${selector}`);
    await locator.click({ timeout: 10_000 }).catch(() => {});
    return true;
  }
  return false;
}

async function clickInTaskContinueIfNeeded(page) {
  const selectors = [
    '.exp-continue-btn[data-action="continue"]',
    'button[data-action="continue"]',
    'button:has-text("I Consent")',
    'button:has-text("Continue")',
    'button:has-text("Next")',
    'button:has-text("Done")',
    'button:has-text("Submit")',
    'button:has-text("Finish")',
    'button:has-text("Start")',
    'a:has-text("Continue")',
    'a:has-text("Next")',
    'a:has-text("Done")',
    'input[type="submit"]'
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;
    const visible = await locator.isVisible().catch(() => false);
    if (!visible) continue;
    const enabled = await locator.isEnabled().catch(() => false);
    if (!enabled) continue;

    const text = (await locator.innerText().catch(() => "")).trim().toLowerCase();
    const action = (await locator.getAttribute("data-action").catch(() => "")) || "";
    if (action === "exit") continue;
    if (text.includes("disagree")) continue;
    if (text.includes("exit study")) continue;

    console.log(`Clicking in-task continue control: ${selector}`);
    await locator.click({ timeout: 10_000 }).catch(() => {});
    return true;
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
  const launchPublix = isPublixUrl(runUrl);
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
  let sawJatosRedirectSignal = false;

  await page.addInitScript(() => {
    const installJatosDiagnostics = () => {
      const w = window;
      const j = w?.jatos;
      if (!j || (j).__autoresponderWrapped) return;
      const wrap = (name) => {
        const original = j[name];
        if (typeof original !== "function") return;
        j[name] = async (...args) => {
          try {
            console.log(`[AutoResponder:JATOS] ${name} called`);
            const result = await original.apply(j, args);
            console.log(`[AutoResponder:JATOS] ${name} succeeded`);
            return result;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[AutoResponder:JATOS] ${name} failed: ${message}`);
            throw error;
          }
        };
      };
      wrap("submitResultData");
      wrap("appendResultData");
      wrap("endStudy");
      wrap("endStudyAndRedirect");
      j.__autoresponderWrapped = true;
    };

    installJatosDiagnostics();
    const timer = window.setInterval(installJatosDiagnostics, 250);
    window.addEventListener("beforeunload", () => window.clearInterval(timer));
  });

  page.on("console", (msg) => {
    const line = `[console:${msg.type()}] ${msg.text()}`;
    console.log(line);
    if (msg.text().includes("[AutoResponder] JATOS Redirecting to:")) {
      sawJatosRedirectSignal = true;
    }
  });
  page.on("pageerror", (err) => {
    console.error(`[pageerror] ${String(err)}`);
  });
  page.on("requestfailed", (req) => {
    const failure = req.failure();
    console.error(`[requestfailed] ${req.method()} ${req.url()} ${failure?.errorText || ""}`);
  });
  page.on("response", async (res) => {
    const status = res.status();
    const req = res.request();
    if (status >= 400) {
      const url = res.url();
      const method = req.method();
      const reqHeaders = await req.allHeaders().catch(() => ({}));
      const reqBody = req.postData() || "";
      const resText = await res.text().catch(() => "");
      console.error(`[response:${status}] ${method} ${url}`);

      // Publish fuller diagnostics for JATOS endpoints to debug 400s/500s.
      if (/\/publix\//i.test(url) || /jatos/i.test(url)) {
        if (Object.keys(reqHeaders).length > 0) {
          console.error(`[response:${status}] request headers: ${JSON.stringify(reqHeaders)}`);
        }
        if (reqBody) {
          const truncatedBody = reqBody.length > 4000 ? `${reqBody.slice(0, 4000)}...<truncated>` : reqBody;
          console.error(`[response:${status}] request body: ${truncatedBody}`);
        }
        if (resText) {
          const truncatedResText = resText.length > 4000 ? `${resText.slice(0, 4000)}...<truncated>` : resText;
          console.error(`[response:${status}] response body: ${truncatedResText}`);
        }
      }
    }
  });

  console.log(`Launching: ${runUrl}`);
  await page.goto(runUrl, { waitUntil: "domcontentloaded", timeout: args.gotoTimeoutMs });

  let lastHeartbeatMs = 0;
  let sawPublix = launchPublix || isPublixUrl(page.url());

  async function completeRun(status, elapsed, reason) {
    await saveArtifacts(page, artifactDir, "complete");
    const summary = {
      status,
      elapsedMs: elapsed,
      finalUrl: page.url(),
      reason,
      finishedAt: Date.now(),
    };
    await fs.writeFile(path.join(artifactDir, "result.json"), JSON.stringify(summary, null, 2), "utf8");
    console.log(`Completed in ${(elapsed / 1000).toFixed(1)}s (${reason})`);
    console.log(`Artifacts: ${artifactDir}`);
    await browser.close();
    process.exit(0);
  }

  try {
    while (true) {
      const elapsed = Date.now() - startedAt;
      if (elapsed > maxMs) {
        await saveArtifacts(page, artifactDir, "timeout");
        throw new Error(`Timed out after ${(elapsed / 1000).toFixed(1)}s`);
      }

      const currentUrl = page.url();
      if (isPublixUrl(currentUrl)) {
        sawPublix = true;
        if (isPublixFinalUrl(currentUrl)) {
          await completeRun("completed", elapsed, "reached_publix_final_page");
        }
      } else if (sawPublix) {
        // We were in a Publix run and then navigated away (e.g., final credit redirect).
        await completeRun("completed", elapsed, "redirected_away_from_publix");
      }

      const doneSignal = await pageHasDoneSignal(page, args.doneSelector, args.doneText);
      const advanceControlsVisible = await hasVisibleAdvanceControl(page);
      if (doneSignal && !advanceControlsVisible) {
        await completeRun("completed", elapsed, "done_signal_without_advance_controls");
      }
      if (sawJatosRedirectSignal) {
        await completeRun("completed", elapsed, "observed_jatos_redirect_signal");
      }

      await clickLaunchIfNeeded(page, args.startSelector);
      await clickFullscreenGateIfNeeded(page);
      await clickInTaskContinueIfNeeded(page);

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
