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

test("normal play is left-hand and the handle is machine-controlled", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("通常・左打ち", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "通常・左" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "RUSH・右" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("Launch Power")).toBeDisabled();
});

test("mobile controls use a drawer", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("iphone") && !testInfo.project.name.includes("android"), "mobile project only");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
  await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.getByLabel("Debug and calibration panel")).toBeVisible();
});
