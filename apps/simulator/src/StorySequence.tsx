import { useEffect, useState } from "react";

const FPS = 16;
const FRAME_COUNT = 96;

export function StorySequence({ drawId, jackpot }: { readonly drawId: number; readonly jackpot: boolean }) {
  const [frame, setFrame] = useState(1);

  useEffect(() => {
    setFrame(1);
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const elapsedFrames = Math.floor((performance.now() - startedAt) * FPS / 1000);
      setFrame(Math.min(jackpot ? FRAME_COUNT : 84, elapsedFrames + 1));
    }, 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [drawId, jackpot]);

  const source = `/assets/story/frames/frame-${String(frame).padStart(4, "0")}.jpg`;
  return <img className="story-frame" src={source} alt="オリジナルロボットアニメ抽選演出" draggable={false}/>;
}
