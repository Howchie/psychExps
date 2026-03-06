import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { Download, Page, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";

function installDownloadCapture(page: Page, testInfo: TestInfo): { flush: () => Promise<string[]> } {
  const downloads: Download[] = [];
  page.on("download", (download) => {
    downloads.push(download);
  });
  return {
    flush: async () => {
      const outDir = path.join(testInfo.outputDir, "downloads");
      await mkdir(outDir, { recursive: true });
      const saved: string[] = [];
      for (let i = 0; i < downloads.length; i += 1) {
        const download = downloads[i];
        const filename = download.suggestedFilename() || `download_${i + 1}`;
        const target = path.join(outDir, filename);
        await download.saveAs(target);
        saved.push(target);
      }
      return saved;
    },
  };
}

test("sft completes in auto mode", async ({ page }, testInfo) => {
  const capture = installDownloadCapture(page, testInfo);
  await page.goto("/?task=sft&variant=default&auto=true&participant=auto_e2e_sft");
  await expect(page.getByText("SFT complete")).toBeVisible();
  await page.waitForTimeout(1000);
  const files = await capture.flush();
  expect(files.length).toBeGreaterThan(0);
});

test("stroop completes in auto mode", async ({ page }, testInfo) => {
  const capture = installDownloadCapture(page, testInfo);
  await page.goto("/?task=stroop&variant=default&auto=true&participant=auto_e2e_stroop");
  await expect(page.getByText("Stroop complete")).toBeVisible();
  await page.waitForTimeout(1000);
  const files = await capture.flush();
  expect(files.length).toBeGreaterThan(0);
});

test("change_detection completes in auto mode", async ({ page }, testInfo) => {
  const capture = installDownloadCapture(page, testInfo);
  await page.goto("/?task=change_detection&variant=default&auto=true&participant=auto_e2e_cd");
  
  const downloadPromise = page.waitForEvent("download");
  await expect(page.getByText("Task Complete")).toBeVisible(); 
  await downloadPromise;

  await page.waitForTimeout(1000);
  const files = await capture.flush();
  expect(files.length).toBeGreaterThan(0);
});
