import { useCallback, useEffect, useRef } from "react";
import { LOTTERY_TIMING, presentationKey, storyPlaybackPlanAt, type LotteryClockReader, type LotteryPresentation } from "./lotteryTimeline.js";
import {
  DEFAULT_MAX_VIDEO_DROP_RATE,
  DEFAULT_TARGET_FPS,
  evaluateTimeline,
  frameSummaryPasses,
  summarizeAvSkew,
  summarizeFrames,
  summarizeVideoFrames,
  type TimelineSample,
} from "./smoothnessMetrics.js";

interface Props {
  readonly presentation: LotteryPresentation;
  readonly physicsStepMs: number;
  readonly trigger: (rawState: number) => boolean;
  readonly push: () => void;
  readonly readClock: LotteryClockReader;
  readonly targetFps?: number;
  readonly maxVideoDropRate?: number;
}

interface ActiveRun {
  readonly jackpot: boolean;
  readonly drawId: number;
  readonly wallStartedAt: number;
  readonly frameIntervals: number[];
  readonly frameGaps: Array<{ readonly startMs: number; readonly durationMs: number }>;
  readonly transitions: TimelineSample[];
  readonly physicsSteps: number[];
  readonly longTasks: Array<{ readonly startMs: number; readonly durationMs: number }>;
  readonly videoStart: { readonly total: number; readonly dropped: number };
  readonly avSkewsMs: number[];
  readonly reducedMotion: MediaQueryList;
  pushRequested: boolean;
  phaseBeforePush: LotteryPresentation["phase"] | null;
  lastFrameAt: number;
  lastPresentationKey: string;
}

function videoQuality() {
  const quality = document.querySelector<HTMLVideoElement>("[data-story-video]")?.getVideoPlaybackQuality();
  return { total: quality?.totalVideoFrames ?? 0, dropped: quality?.droppedVideoFrames ?? 0 };
}

export function SmoothnessHarness({
  presentation,
  physicsStepMs,
  trigger,
  push,
  readClock,
  targetFps = DEFAULT_TARGET_FPS,
  maxVideoDropRate = DEFAULT_MAX_VIDEO_DROP_RATE,
}: Props) {
  const activeRef = useRef<ActiveRun | null>(null);
  const physicsStepRef = useRef(physicsStepMs);
  const presentationRef = useRef(presentation);
  const observerRef = useRef<PerformanceObserver | null>(null);
  const animationRef = useRef(0);
  const autoStartedRef = useRef(false);
  physicsStepRef.current = physicsStepMs;
  presentationRef.current = presentation;

  const finish = useCallback(() => {
    const active = activeRef.current;
    if (active === null) return;
    const videoEnd = videoQuality();
    const totalVideoFrames = Math.max(0, videoEnd.total - active.videoStart.total);
    const droppedVideoFrames = Math.max(0, videoEnd.dropped - active.videoStart.dropped);
    const frames = summarizeFrames(active.frameIntervals);
    const video = summarizeVideoFrames(totalVideoFrames, droppedVideoFrames, maxVideoDropRate);
    const timeline = evaluateTimeline(active.transitions, active.jackpot);
    const avSync = summarizeAvSkew(active.avSkewsMs);
    const averagePhysicsStepMs = active.physicsSteps.length === 0 ? 0 : active.physicsSteps.reduce((sum, value) => sum + value, 0) / active.physicsSteps.length;
    const framePass = frameSummaryPasses(frames, targetFps);
    const timingPass = timeline.maxAbsSkewMs <= 50;
    const pushGatePass = active.phaseBeforePush === "FREEZE";
    const report = {
      timestamp: new Date().toISOString(),
      scenario: active.jackpot ? "jackpot" : "reach-miss",
      pass: timeline.pass && framePass && video.pass && avSync.pass && timingPass && pushGatePass && active.longTasks.length === 0,
      semantic: timeline,
      frames: { ...frames, targetFps, pass: framePass, gaps: active.frameGaps },
      video: { ...video, baselineRequired: true },
      avSync,
      timelineTimingPass: timingPass,
      pushGate: { phaseBeforePush: active.phaseBeforePush, pass: pushGatePass },
      longTasks: active.longTasks,
      physics: { samples: active.physicsSteps.length, averageStepMs: averagePhysicsStepMs, maxStepMs: Math.max(0, ...active.physicsSteps) },
    };
    Object.assign(window, { __PACHINKO_HARNESS_REPORT__: report });
    localStorage.setItem("pachinko:lastHarnessReport", JSON.stringify(report));
    window.dispatchEvent(new CustomEvent("pachinko:harness-complete", { detail: report }));
    observerRef.current?.disconnect();
    observerRef.current = null;
    activeRef.current = null;
  }, [maxVideoDropRate, targetFps]);

  const start = useCallback((jackpot: boolean): boolean => {
    if (activeRef.current !== null || !trigger(jackpot ? 319 : 1)) return false;
    const clock = readClock();
    if (!clock.active) return false;
    const active: ActiveRun = {
      jackpot,
      drawId: clock.drawId,
      wallStartedAt: performance.now(),
      frameIntervals: [],
      frameGaps: [],
      transitions: [],
      physicsSteps: [],
      longTasks: [],
      videoStart: videoQuality(),
      avSkewsMs: [],
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)"),
      pushRequested: false,
      phaseBeforePush: null,
      lastFrameAt: 0,
      lastPresentationKey: "",
    };
    activeRef.current = active;
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.startTime >= active.wallStartedAt) active.longTasks.push({ startMs: entry.startTime - active.wallStartedAt, durationMs: entry.duration });
        }
      });
      observer.observe({ type: "longtask" });
      observerRef.current = observer;
    }
    const sampleFrame = (now: number) => {
      if (activeRef.current !== active) return;
      const wallNow = performance.now();
      const clock = readClock();
      if (active.transitions.length > 0 && active.lastFrameAt > 0) {
        const interval = now - active.lastFrameAt;
        active.frameIntervals.push(interval);
        active.physicsSteps.push(physicsStepRef.current);
        if (interval >= 50) active.frameGaps.push({ startMs: wallNow - active.wallStartedAt - interval, durationMs: interval });
      }
      active.lastFrameAt = now;
      const video = document.querySelector<HTMLVideoElement>("[data-story-video]");
      if (clock.active && clock.drawId === active.drawId && video !== null && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const plan = storyPlaybackPlanAt(clock, active.jackpot, active.reducedMotion.matches, document.visibilityState === "visible");
        active.avSkewsMs.push((video.currentTime - plan.mediaTimeSeconds) * 1_000);
      }
      if (!active.pushRequested && clock.active && clock.drawId === active.drawId && !clock.pushed && clock.elapsedMs >= LOTTERY_TIMING.freeze && wallNow - active.wallStartedAt >= LOTTERY_TIMING.result && presentationRef.current.phase === "FREEZE") {
        active.phaseBeforePush = presentationRef.current.phase;
        active.pushRequested = true;
        push();
      }
      if (!clock.active && clock.drawId === active.drawId && presentationRef.current.phase === "IDLE") finish();
      else animationRef.current = requestAnimationFrame(sampleFrame);
    };
    animationRef.current = requestAnimationFrame(sampleFrame);
    return true;
  }, [finish, push, readClock, trigger]);

  useEffect(() => {
    if (autoStartedRef.current) return;
    let cancelled = false;
    const jackpot = new URLSearchParams(window.location.search).get("scenario") === "jackpot";
    const attempt = () => {
      if (cancelled) return;
      if (start(jackpot)) {
        autoStartedRef.current = true;
        return;
      }
      animationRef.current = requestAnimationFrame(attempt);
    };
    attempt();
    return () => {
      cancelled = true;
      autoStartedRef.current = false;
      activeRef.current = null;
      cancelAnimationFrame(animationRef.current);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [start]);

  useEffect(() => {
    const active = activeRef.current;
    if (active === null) return;
    if (presentation.drawId !== active.drawId) return;
    const key = presentationKey(presentation);
    if (key === active.lastPresentationKey) return;
    const clock = readClock();
    if (clock.drawId !== active.drawId) return;
    if (active.transitions.length === 0) active.lastFrameAt = 0;
    active.lastPresentationKey = key;
    active.transitions.push({ phase: presentation.phase, digits: presentation.digits, spinning: presentation.spinning, actualMs: clock.elapsedMs });
  }, [presentation, readClock]);

  return null;
}
