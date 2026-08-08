import { expect, test } from "@playwright/test";

test("renders board and launches a ball", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pachinko Flow Simulator" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  const controls = page.getByRole("button", { name: "Controls" });
  if (await controls.isVisible()) await controls.click();
  await page.getByRole("button", { name: "Fire", exact: true }).click();
  await expect(page.getByText(/Launched 1/)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("100 balls/min (REALISTIC)")).toBeVisible();
});

test("mobile controls use a drawer", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("iphone") && !testInfo.project.name.includes("android"), "mobile project only");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Controls" })).toBeVisible();
  await page.getByRole("button", { name: "Controls" }).click();
  await expect(page.getByLabel("Debug and calibration panel")).toBeVisible();
});
