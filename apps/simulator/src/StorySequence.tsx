import { useEffect, useRef } from "react";
import { storyPlaybackPlanAt, type LotteryClockReader, type LotteryPhase } from "./lotteryTimeline.js";

const PLAYING_SEEK_TOLERANCE_SECONDS = 0.02;

export function StorySequence({ active, drawId, phase, jackpot, readClock }: { readonly active: boolean; readonly drawId: number; readonly phase: LotteryPhase; readonly jackpot: boolean; readonly readClock: LotteryClockReader }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let playPending = false;
    const sync = () => {
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      const observedClock = readClock();
      const clock = active && observedClock.active && observedClock.drawId === drawId
        ? observedClock
        : { active: false, drawId, elapsedMs: 0, pushed: false };
      const plan = storyPlaybackPlanAt(clock, jackpot, motion.matches, document.visibilityState === "visible");
      const duration = Number.isFinite(video.duration) ? video.duration : plan.mediaTimeSeconds;
      const target = Math.min(plan.mediaTimeSeconds, duration);
      const tolerance = plan.play ? PLAYING_SEEK_TOLERANCE_SECONDS : 0.001;
      if (Math.abs(video.currentTime - target) > tolerance) {
        try { video.currentTime = target; } catch { /* metadata is not ready yet */ }
      }
      video.playbackRate = plan.playbackRate;
      if (!plan.play) {
        video.pause();
        return;
      }
      if (video.paused && !video.ended && !playPending) {
        playPending = true;
        void video.play().catch(() => undefined).finally(() => { playPending = false; });
      }
      animationFrame = requestAnimationFrame(sync);
    };
    sync();
    const onVisibilityChange = () => sync();
    video.addEventListener("loadedmetadata", sync);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motion.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(animationFrame);
      video.removeEventListener("loadedmetadata", sync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motion.removeEventListener("change", sync);
    };
  }, [active, drawId, jackpot, phase, readClock]);

  return <video
    ref={videoRef}
    className="story-frame"
    data-story-video
    src="/assets/story/story-smooth.mp4"
    poster="/assets/story/keyframes/story-01.png"
    aria-hidden="true"
    muted
    playsInline
    preload="auto"
  />;
}
