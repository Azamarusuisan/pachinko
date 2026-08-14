import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

/* global document, window */

const CDP_ENDPOINT = "http://127.0.0.1:9223";
const WINDOW = { width: 500, height: 375 };
const VIEWPORT = { width: 500, height: 288 };
const PROFILE = join(homedir(), ".hermes-browser/chrome-profile");
const REPORT_TIMEOUT_MS = 20_000;

function options() {
  let scenario;
  let baseUrl = "http://127.0.0.1:5173/";
  for (let index = 2; index < process.argv.length; index += 1) {
    const name = process.argv[index];
    const value = process.argv[index + 1];
    if ((name !== "--scenario" && name !== "--base-url") || value === undefined || value.startsWith("--")) {
      throw new Error(`Usage: npm run test:hermes-small -- [--scenario miss|jackpot] [--base-url http://127.0.0.1:5173/]`);
    }
    if (name === "--scenario") scenario = value;
    else baseUrl = value;
    index += 1;
  }
  if (scenario !== undefined && scenario !== "miss" && scenario !== "jackpot") throw new Error(`Unknown scenario: ${scenario}`);
  const url = new URL(baseUrl);
  if (!(["http:", "https:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) || url.username !== "" || url.password !== "") {
    throw new Error("--base-url must be an uncredentialed loopback HTTP(S) URL");
  }
  return { baseUrl: url, scenarios: scenario === undefined ? ["miss", "jackpot"] : [scenario] };
}

function verifyHermesProcess() {
  const lines = execFileSync("ps", ["ax", "-ww", "-o", "pid=,command="], { encoding: "utf8" }).split("\n");
  const browsers = lines.filter((line) => line.includes("/Google Chrome.app/Contents/MacOS/Google Chrome ") && !line.includes(" --type="));
  const port = browsers.filter((line) => line.includes("--remote-debugging-port=9223"));
  const profile = browsers.filter((line) => line.includes(`--user-data-dir=${PROFILE}`));
  if (port.length !== 1 || profile.length !== 1 || port[0] !== profile[0]) {
    throw new Error(`Refusing CDP connection: port 9223 and ${PROFILE} are not on the same single Chrome browser process`);
  }
}

async function runScenario(page, baseUrl, scenario) {
  const url = new URL(baseUrl);
  url.searchParams.set("harness", "lottery");
  url.searchParams.set("scenario", scenario);
  url.searchParams.set("hermesRun", randomUUID());
  await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: REPORT_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const report = Reflect.get(window, "__PACHINKO_HARNESS_REPORT__");
    return typeof report === "object" && report !== null && typeof Reflect.get(report, "pass") === "boolean";
  }, undefined, { timeout: REPORT_TIMEOUT_MS });
  const measured = await page.evaluate(() => ({
    report: Reflect.get(window, "__PACHINKO_HARNESS_REPORT__"),
    visibility: document.visibilityState,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
  }));
  return { scenario, ...measured };
}

async function runIsolatedScenario(browser, baseUrl, scenario) {
  let context;
  let cdp;
  try {
    // Fresh contexts avoid sharing Chrome's background-timer grace between scenarios.
    context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    cdp = await context.newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { ...WINDOW, windowState: "normal" } });
    return await runScenario(page, baseUrl, scenario);
  } finally {
    await cdp?.detach().catch(() => {});
    await context?.close().catch(() => {});
  }
}

async function main() {
  const { baseUrl, scenarios } = options();
  verifyHermesProcess();
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
  const contextsBefore = browser.contexts().length;
  const results = [];
  for (const scenario of scenarios) results.push(await runIsolatedScenario(browser, baseUrl, scenario));
  const contextsAfter = browser.contexts().length;
  const pass = contextsAfter === contextsBefore && results.every(({ report, visibility, outerWidth, outerHeight }) => report.pass === true
    && visibility === "visible" && outerWidth <= WINDOW.width && outerHeight <= WINDOW.height);
  process.stdout.write(`${JSON.stringify({ pass, endpoint: CDP_ENDPOINT, window: WINDOW, contexts: { before: contextsBefore, after: contextsAfter }, results }, null, 2)}\n`);
  process.exit(pass ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
