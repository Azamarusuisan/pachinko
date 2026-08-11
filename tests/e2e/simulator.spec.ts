import { expect, test } from "@playwright/test";

test("renders board and launches a ball", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "未来型パチンコ シミュレーター" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".cabinet-art")).toBeVisible();

  const launched = page.locator(".play-data > div").first().locator("strong");
  await expect(launched).toHaveText("0");
  await page.getByRole("button", { name: "玉を一発発射" }).click();
  await expect(launched).toHaveText("1", { timeout: 5_000 });
});

test("uses one original cabinet shell instead of covering duplicate nails", async ({ page }) => {
  await page.goto("/");
  const cabinet = page.locator(".cabinet-art");
  await expect(cabinet).toHaveCount(1);
  await expect(cabinet).toHaveAttribute("src", "/assets/original-pachinko-cabinet-shell-v1.png");
  await expect(page.locator(".cabinet-bezel")).toHaveCount(0);
  expect(await cabinet.evaluate((element) => getComputedStyle(element).maskImage)).toBe("none");
});

test("keeps the LCD media behind the physical Pixi playfield", async ({ page }) => {
  await page.goto("/");
  const layers = await page.evaluate(() => {
    const style = (selector: string) => getComputedStyle(document.querySelector(selector) as Element);
    return {
      lcd: Number(style(".effect-scene").zIndex),
      digits: Number(style(".lottery-display").zIndex),
      physics: Number(style(".board-canvas").zIndex),
      lcdClip: style(".effect-scene").clipPath,
      digitClip: style(".lottery-display").clipPath,
      obsoleteLayers: document.querySelectorAll(".generated-sequence, .rainbow-jackpot-art").length,
    };
  });
  expect(layers).toMatchObject({ lcd: 0, digits: 1, physics: 2, obsoleteLayers: 0 });
  expect(layers.digitClip).toBe(layers.lcdClip);
});

test("normal play is left-hand and the handle is machine-controlled", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("通常・左打ち", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "通常・左" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "RUSH・右" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Launch Power")).toBeDisabled();
});

test("reach has matching outer reels while only the center keeps spinning", async ({ page }) => {
  await page.goto("/?harness=lottery");
  await expect(page.locator(".effect-subtitle.reach")).toContainText("赤保留 × 金縁・中央変動中", { timeout: 3_000 });
  await expect(page.locator(".lottery-display i").nth(0)).toHaveClass(/stopped/);
  await expect(page.locator(".lottery-display i").nth(1)).toHaveClass(/spinning/);
  await expect(page.locator(".lottery-display i").nth(2)).toHaveClass(/stopped/);
  const outerDigits = await page.locator(".lottery-display i.stopped .reel-symbol").allTextContents();
  expect(outerDigits).toHaveLength(2);
  expect(outerDigits[0]).toBe(outerDigits[1]);
});

test("PUSH advances the already-determined judgement", async ({ page }) => {
  await page.goto("/?harness=lottery");
  const push = page.getByRole("button", { name: "PUSHで当落を見る" });
  await expect(push).toBeVisible({ timeout: 6_000 });
  await page.waitForTimeout(500);
  await expect(page.locator(".effect-subtitle.freeze")).toBeVisible();
  await push.click();
  await expect(page.locator(".effect-subtitle.result")).toBeVisible({ timeout: 1_000 });
});

test("smoothness harness completes the same truthful PUSH sequence", async ({ page }) => {
  await page.goto("/?harness=lottery");
  await page.waitForFunction(() => "__PACHINKO_HARNESS_REPORT__" in window, undefined, { timeout: 12_000 });
  const report = await page.evaluate(() => (window as typeof window & { __PACHINKO_HARNESS_REPORT__: { semantic: { complete: boolean; reachValid: boolean; resultValid: boolean }; pushGate: { pass: boolean } } }).__PACHINKO_HARNESS_REPORT__);
  const semantic = report.semantic;
  expect(semantic).toMatchObject({ complete: true, reachValid: true, resultValid: true });
  expect(report.pushGate.pass).toBe(true);
});

test("mobile controls use a drawer", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("iphone") && !testInfo.project.name.includes("android"), "mobile project only");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
  await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.getByLabel("Debug and calibration panel")).toBeVisible();
});
