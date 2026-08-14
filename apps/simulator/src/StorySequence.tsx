import { useEffect, useRef } from "react";
import { STORY_VIDEO_TIMING, storyPlaybackPlanAt, type LotteryClockReader, type StoryPlaybackPlan } from "./lotteryTimeline.js";

export function StorySequence({ active, drawId, jackpot, readClock }: { readonly active: boolean; readonly drawId: number; readonly jackpot: boolean; readonly readClock: LotteryClockReader }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video === null) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrame = 0;
    let videoFrameCallback = 0;
    let playPending = false;
    let advancingToFrame: number | null = null;
    let lastReason: StoryPlaybackPlan["reason"] | null = null;
    const play = () => {
      if (!video.paused || video.ended || playPending) return;
      playPending = true;
      void video.play().catch(() => undefined).finally(() => { playPending = false; });
    };
    const advanceToStaticFrame = (targetFrame: number) => {
      if (advancingToFrame === targetFrame) return;
      advancingToFrame = targetFrame;
      const onVideoFrame: VideoFrameRequestCallback = (_now, metadata) => {
        videoFrameCallback = 0;
        const presentedFrame = Math.floor(metadata.mediaTime * STORY_VIDEO_TIMING.fps + 1e-6);
        if (presentedFrame >= targetFrame) {
          video.pause();
          advancingToFrame = null;
        } else videoFrameCallback = video.requestVideoFrameCallback(onVideoFrame);
      };
      videoFrameCallback = video.requestVideoFrameCallback(onVideoFrame);
      play();
    };
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
      const currentFrame = Math.min(STORY_VIDEO_TIMING.totalFrames - 1, Math.floor(Math.max(0, video.currentTime) * STORY_VIDEO_TIMING.fps + 1e-6));
      const allowedFrameDrift = plan.play && lastReason === "playing" ? 1 : 0;
      const sequentialPushFrame = lastReason === "freeze" && plan.mediaFrame === currentFrame + 1;
      if (!sequentialPushFrame && advancingToFrame === null && Math.abs(currentFrame - plan.mediaFrame) > allowedFrameDrift && !video.seeking) {
        try { video.currentTime = target; } catch { /* metadata is not ready yet */ }
      }
      video.playbackRate = plan.playbackRate;
      if (!plan.play) {
        if (sequentialPushFrame && plan.reason === "miss") advanceToStaticFrame(plan.mediaFrame);
        else if (advancingToFrame === null) video.pause();
      } else play();
      lastReason = plan.reason;
      if (active) animationFrame = requestAnimationFrame(sync);
    };
    sync();
    const onVisibilityChange = () => sync();
    video.addEventListener("loadedmetadata", sync);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motion.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(animationFrame);
      if (videoFrameCallback !== 0) video.cancelVideoFrameCallback(videoFrameCallback);
      video.removeEventListener("loadedmetadata", sync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motion.removeEventListener("change", sync);
    };
  }, [active, drawId, jackpot, readClock]);

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
