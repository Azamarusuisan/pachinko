import { StorySequence } from "./StorySequence.js";
import type { LotteryClockReader, LotteryPresentation as Presentation } from "./lotteryTimeline.js";

const LOTTERY_COPY = {
  IDLE: ["", ""], CHANCE: ["変動中", "左図柄から停止"], REACH: ["リーチ", "左右同図柄・中央変動中"],
  FREEZE: ["PUSH", "押して決着"], RESULT: ["ハズレ", "次の変動へ"], JACKPOT: ["大当り", "RUSH突入・右打ち"],
} as const;
const REEL_SYMBOLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;
const HOLD_COPY = {
  blue: ["変動中", "青保留・左図柄から停止"], green: ["チャンス", "緑保留・期待度上昇"],
  red: ["激熱", "赤保留・高期待度"], rainbow: ["虹", "大当り濃厚"],
} as const;

export function LotteryPresentation({ presentation, rush, onPush, readClock }: { readonly presentation: Presentation; readonly rush: boolean; readonly onPush: () => void; readonly readClock: LotteryClockReader }) {
  const active = presentation.phase !== "IDLE";
  const emphasizedReach = presentation.hotCue && presentation.phase === "REACH";
  const copy = presentation.phase === "CHANCE" ? HOLD_COPY[presentation.holdColor]
    : emphasizedReach ? [presentation.holdColor === "rainbow" ? "超激熱" : "激熱", `${presentation.holdColor === "rainbow" ? "虹保留 × 金縁" : "赤保留 × 金縁"}・中央変動中`] as const
    : LOTTERY_COPY[presentation.phase];
  return <>
    <div className={`effect-scene ${presentation.phase.toLowerCase()} ${presentation.hotCue ? "hot" : ""} ${presentation.reach ? "reach-route" : "normal-route"} ${presentation.jackpot ? "jackpot-outcome" : ""} ${rush && !active ? "rush" : ""}`}>
      <StorySequence active={active && presentation.reach} drawId={presentation.drawId} jackpot={presentation.jackpot} readClock={readClock}/>
    </div>
    <div className={`lottery-display ${active ? "active" : ""}`} aria-hidden="true">
      {presentation.digits.map((digit, index) => <i key={index} className={presentation.spinning[index] ? "spinning" : "stopped"}>
        {presentation.spinning[index]
          ? <span className="reel-track">{REEL_SYMBOLS.map((symbol, symbolIndex) => <b key={symbolIndex}>{symbol}</b>)}</span>
          : <b className="reel-symbol">{digit}</b>
        }
      </i>)}
    </div>
    <div className={`effect-subtitle ${presentation.phase.toLowerCase()} tone-${presentation.holdColor} ${emphasizedReach ? "hot" : ""}`}>
      {presentation.phase === "FREEZE" ? <button type="button" className="push-button" onClick={onPush} aria-label="PUSHで当落を見る">{copy[0]}</button> : <b data-text={copy[0]}>{copy[0]}</b>}<span>{copy[1]}</span>
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {active ? `${copy[0]} ${copy[1]} 図柄 ${presentation.digits.join("・")}` : ""}
    </span>
  </>;
}
