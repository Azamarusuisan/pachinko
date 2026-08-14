/* global window, document */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(projectDir, "../..");
const storyDir = resolve(repoDir, "apps/simulator/public/assets/story");
const snapshotsDir = resolve(projectDir, "snapshots-hermes");
const input = resolve(projectDir, "index.html");
const output = resolve(storyDir, "story-smooth.mp4");
const poster = resolve(storyDir, "keyframes/story-01.png");
const fps = 30;
const duration = 8.5;
const frames = fps * duration;
const endpoint = process.env.HERMES_CDP_URL ?? "http://127.0.0.1:9223";

const run = (command, args) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolveRun(stdout) : reject(new Error(`${command} exited ${code}\n${stderr}`)),
    );
  });

const sha256 = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");

async function seek(page, seconds) {
  await page.evaluate((time) => {
    const timeline = window.__timelines?.["pachinko-liquid-reach"];
    if (!timeline) throw new Error("registered HyperFrames timeline not found");
    timeline.pause().totalTime(time, false);
    window.gsap.ticker.tick();
  }, seconds);
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), "pachinko-hf-"));
  const tempVideo = join(tempDir, "story-smooth.mp4");
  const tempPoster = join(tempDir, "story-01.png");
  let rendered = false;
  let page;
  let context;
  let server;

  try {
    const html = await readFile(input);
    server = createServer((request, response) => {
      if (request.url === "/" || request.url === "/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
      } else if (request.url === "/favicon.ico") {
        response.writeHead(204).end();
      } else {
        response.writeHead(404).end();
      }
    });
    await new Promise((resolveListen, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("local render server failed to bind");

    const browser = await chromium.connectOverCDP(endpoint);
    context = await browser.newContext({
      viewport: { width: 640, height: 360 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();

    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });

    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__timelines?.["pachinko-liquid-reach"]));

    const layout = await page.evaluate(() => {
      const stage = document.querySelector("#stage").getBoundingClientRect();
      return {
        width: stage.width,
        height: stage.height,
        devicePixelRatio: window.devicePixelRatio,
        timelineDuration: window.__timelines["pachinko-liquid-reach"].duration(),
      };
    });
    if (layout.width !== 640 || layout.height !== 360 || layout.devicePixelRatio !== 1) {
      throw new Error(`unexpected render geometry: ${JSON.stringify(layout)}`);
    }
    if (layout.timelineDuration > duration || duration - layout.timelineDuration > 1 / fps) {
      throw new Error(`timeline is ${layout.timelineDuration}s, expected ${duration}s`);
    }

    await mkdir(snapshotsDir, { recursive: true });
    await mkdir(dirname(poster), { recursive: true });
    const proofFrames = new Map([
      [0, "00-idle.png"],
      [71, "01-red-reach.png"],
      [139, "02-push-freeze.png"],
      [140, "03-winning-resume.png"],
      [254, "04-rainbow-settle.png"],
    ]);

    for (let frame = 0; frame < frames; frame += 1) {
      await seek(page, frame / fps);
      const framePath = join(tempDir, `frame-${String(frame).padStart(4, "0")}.png`);
      await page.screenshot({
        path: framePath,
        clip: { x: 0, y: 0, width: 640, height: 360 },
        scale: "css",
      });
      const proofName = proofFrames.get(frame);
      if (proofName) {
        const proofPath = join(snapshotsDir, proofName);
        await page.screenshot({
          path: proofPath,
          clip: { x: 0, y: 0, width: 640, height: 360 },
          scale: "css",
        });
        if (frame === 139) {
          await page.screenshot({
            path: tempPoster,
            clip: { x: 0, y: 0, width: 640, height: 360 },
            scale: "css",
          });
        }
      }
    }

    if (runtimeErrors.length) throw new Error(`runtime errors:\n${runtimeErrors.join("\n")}`);

    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(fps),
      "-start_number",
      "0",
      "-i",
      join(tempDir, "frame-%04d.png"),
      "-frames:v",
      String(frames),
      "-c:v",
      "libx264",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      tempVideo,
    ]);

    const probe = JSON.parse(
      await run("ffprobe", [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration",
        "-of",
        "json",
        tempVideo,
      ]),
    );
    const stream = probe.streams?.[0];
    if (
      stream?.codec_name !== "h264" ||
      stream.width !== 640 ||
      stream.height !== 360 ||
      stream.r_frame_rate !== "30/1" ||
      Number(stream.nb_read_frames) !== frames ||
      Math.abs(Number(probe.format?.duration) - duration) > 0.01
    ) {
      throw new Error(`render contract failed: ${JSON.stringify(probe)}`);
    }

    await rename(tempVideo, output);
    await rename(tempPoster, poster);
    rendered = true;
    const audit = {
      renderer: "Hermes Chrome CDP deterministic seek + ffmpeg",
      endpoint,
      sourceCommit: "working-tree",
      layout,
      probe,
      hashes: {
        brief: await sha256(resolve(projectDir, "BRIEF.md")),
        composition: await sha256(input),
        motionPlan: await sha256(resolve(projectDir, "index.motion.json")),
        shotPlan: await sha256(resolve(projectDir, "shot-plan.json")),
        video: await sha256(output),
        poster: await sha256(poster),
      },
      runtimeErrors,
    };
    await writeFile(resolve(projectDir, "render-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  } finally {
    await context?.close().catch(() => page?.close().catch(() => {}));
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    if (rendered) await rm(tempDir, { recursive: true, force: true });
    else process.stderr.write(`render frames preserved at ${tempDir}\n`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
