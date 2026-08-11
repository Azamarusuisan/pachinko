import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertIndependentTrainHoldout, parseObservedCapture, summarizeObservedCapture } from "./index.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function load(path: string) {
  return parseObservedCapture(JSON.parse(await readFile(resolve(path), "utf8")) as unknown);
}

const capturePath = argument("capture");
const trainPath = argument("train");
const holdoutPath = argument("holdout");

if (capturePath !== undefined && trainPath === undefined && holdoutPath === undefined) {
  const capture = await load(capturePath);
  process.stdout.write(`${JSON.stringify({ captureId: capture.captureId, summary: summarizeObservedCapture(capture) }, null, 2)}\n`);
} else if (capturePath === undefined && trainPath !== undefined && holdoutPath !== undefined) {
  const train = await load(trainPath);
  const holdout = await load(holdoutPath);
  assertIndependentTrainHoldout(train, holdout);
  process.stdout.write(`${JSON.stringify({ train: summarizeObservedCapture(train), holdout: summarizeObservedCapture(holdout) }, null, 2)}\n`);
} else {
  throw new Error("Usage: observed-cli --capture capture.json OR --train train.json --holdout holdout.json");
}
