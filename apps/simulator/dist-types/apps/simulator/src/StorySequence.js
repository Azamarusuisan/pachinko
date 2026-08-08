import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from "react";
const FPS = 16;
const FRAME_COUNT = 96;
export function StorySequence({ drawId, jackpot }) {
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
    return _jsx("img", { className: "story-frame", src: source, alt: "\u30AA\u30EA\u30B8\u30CA\u30EB\u30ED\u30DC\u30C3\u30C8\u30A2\u30CB\u30E1\u62BD\u9078\u6F14\u51FA", draggable: false });
}
//# sourceMappingURL=StorySequence.js.map