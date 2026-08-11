import { describe, expect, it } from "vitest";
import {
  LOTTERY_TIMING,
  MAX_LOTTERY_HOLDS,
  RUSH_SHOTS,
  consumeLotteryStart,
  consumeRushShot,
  createLotteryOutcome,
  dequeueLotteryHold,
  holdColorForState,
  lotteryElapsedAfterPush,
  lotteryElapsedAwaitingPush,
  lotteryAudioCueAllowed,
  lotteryPresentationAt,
  nextLotteryRandomState,
  STORY_VIDEO_TIMING,
  storyPlaybackPlanAt,
} from "./lotteryTimeline.js";

describe("lottery timeline", () => {
  it("forms a real reach with matching outer reels and only the center spinning", () => {
    const outcome = createLotteryOutcome(1);
    const reach = lotteryPresentationAt(outcome, LOTTERY_TIMING.reach, 4);
    expect(reach.phase).toBe("REACH");
    expect(reach.digits[0]).toBe(reach.digits[2]);
    expect(reach.spinning).toEqual([false, true, false]);
  });

  it("stops a losing center symbol without changing the reach frame", () => {
    const outcome = createLotteryOutcome(1);
    const result = lotteryPresentationAt(outcome, LOTTERY_TIMING.result, 4);
    expect(result.phase).toBe("RESULT");
    expect(result.digits[0]).toBe(result.digits[2]);
    expect(result.digits[1]).not.toBe(result.digits[0]);
    expect(result.spinning).toEqual([false, false, false]);
  });

  it("shows 777 only for the jackpot outcome", () => {
    const result = lotteryPresentationAt(createLotteryOutcome(319), LOTTERY_TIMING.jackpot, 9);
    expect(result.phase).toBe("JACKPOT");
    expect(result.digits).toEqual([7, 7, 7]);
  });

  it("treats red text as a chance-up independent from the jackpot result", () => {
    expect(createLotteryOutcome(1).hot).toBe(true);
    expect(createLotteryOutcome(30).hot).toBe(false);
    expect(createLotteryOutcome(319).hot).toBe(true);
  });

  it("derives hold color and text heat from the same deterministic draw", () => {
    expect(holdColorForState(1)).toBe("red");
    expect(holdColorForState(10)).toBe("green");
    expect(holdColorForState(100)).toBe("blue");
    expect(createLotteryOutcome(1).holdColor).toBe("red");
  });

  it("ends an ordinary blue spin without manufacturing a reach", () => {
    const outcome = createLotteryOutcome(100);
    expect(outcome.reach).toBe(false);
    const result = lotteryPresentationAt(outcome, LOTTERY_TIMING.normalResult, 5);
    expect(result.phase).toBe("RESULT");
    expect(result.digits[0]).not.toBe(result.digits[2]);
    expect(lotteryPresentationAt(outcome, LOTTERY_TIMING.normalFinish, 5).phase).toBe("IDLE");
  });

  it("allows a non-hot green hold to develop into a truthful reach", () => {
    const outcome = createLotteryOutcome(30);
    expect(outcome.holdColor).toBe("green");
    expect(outcome.hot).toBe(false);
    expect(outcome.reach).toBe(true);
  });

  it("shows the hot cue after a truthful reach instead of covering the full reach", () => {
    const outcome = createLotteryOutcome(1);
    expect(lotteryPresentationAt(outcome, LOTTERY_TIMING.reach, 6).hotCue).toBe(false);
    expect(lotteryPresentationAt(outcome, LOTTERY_TIMING.hot, 6).hotCue).toBe(true);
    expect(lotteryPresentationAt(outcome, LOTTERY_TIMING.hotEnd, 6).hotCue).toBe(false);
  });

  it("holds the completed jackpot and makes red legitimately hot", () => {
    const outcome = createLotteryOutcome(319);
    expect(lotteryPresentationAt(outcome, LOTTERY_TIMING.jackpotFinish - 1, 7).phase).toBe("JACKPOT");
    expect(lotteryPresentationAt(outcome, LOTTERY_TIMING.jackpotFinish, 7).phase).toBe("IDLE");
    let red = 0; let redWins = 0;
    for (let state = 1; state <= 100_000; state += 1) {
      if (holdColorForState(state) !== "red") continue;
      red += 1;
      if (state % 319 === 0) redWins += 1;
    }
    expect(redWins / red).toBeGreaterThan(.45);
  });

  it("lets PUSH advance only the predetermined judgement window", () => {
    expect(lotteryElapsedAfterPush(LOTTERY_TIMING.freeze - 1)).toBe(LOTTERY_TIMING.freeze - 1);
    expect(lotteryElapsedAfterPush(LOTTERY_TIMING.freeze)).toBe(LOTTERY_TIMING.result);
    expect(lotteryElapsedAfterPush(LOTTERY_TIMING.result)).toBe(LOTTERY_TIMING.result);
  });

  it("holds a reach at FREEZE indefinitely until PUSH", () => {
    const outcome = createLotteryOutcome(1);
    const held = lotteryElapsedAwaitingPush(60_000);
    expect(held).toBe(LOTTERY_TIMING.freeze);
    expect(lotteryPresentationAt(outcome, held, 8).phase).toBe("FREEZE");
    expect(lotteryPresentationAt(outcome, lotteryElapsedAfterPush(held), 8).phase).toBe("RESULT");
  });

  it("consumes exactly one deterministic draw for every NORMAL START", () => {
    const seed = 0x15e7a319;
    const expected = nextLotteryRandomState(seed);
    const transition = consumeLotteryStart(seed, "NORMAL", false, []);
    expect(transition).toEqual({ randomState: expected, holds: [], drawNow: expected, disposition: "started" });
    expect(nextLotteryRandomState(seed)).toBe(expected);
  });

  it("keeps holds FIFO, caps them at four, and explicitly drops the fifth", () => {
    let randomState = 0x15e7a319;
    let holds: readonly number[] = [];
    const accepted: number[] = [];
    for (let index = 0; index <= MAX_LOTTERY_HOLDS; index += 1) {
      const transition = consumeLotteryStart(randomState, "NORMAL", true, holds);
      randomState = transition.randomState;
      holds = transition.holds;
      if (transition.disposition === "held") accepted.push(holds.at(-1) ?? -1);
      if (index === MAX_LOTTERY_HOLDS) expect(transition.disposition).toBe("dropped-full");
    }
    expect(holds).toHaveLength(MAX_LOTTERY_HOLDS);
    const dequeued: number[] = [];
    while (holds.length > 0) {
      const transition = dequeueLotteryHold(holds);
      if (transition.next !== undefined) dequeued.push(transition.next);
      holds = transition.holds;
    }
    expect(dequeued).toEqual(accepted);
  });

  it("does not consume the normal lottery state during RUSH", () => {
    const seed = 0x15e7a319;
    expect(consumeLotteryStart(seed, "RUSH", true, [1, 2])).toEqual({ randomState: seed, holds: [1, 2], disposition: "ignored-rush" });
  });

  it("returns from RUSH after exactly one hundred launched balls", () => {
    let transition = { phase: "RUSH" as const, remainingShots: RUSH_SHOTS };
    for (let shot = 1; shot < RUSH_SHOTS; shot += 1) transition = consumeRushShot(transition.phase, transition.remainingShots) as typeof transition;
    expect(transition).toEqual({ phase: "RUSH", remainingShots: 1 });
    expect(consumeRushShot(transition.phase, transition.remainingShots)).toEqual({ phase: "NORMAL", remainingShots: 0 });
  });

  it("keeps the predetermined result unchanged across PUSH", () => {
    const outcome = createLotteryOutcome(319);
    const before = JSON.stringify(outcome);
    const held = lotteryElapsedAwaitingPush(60_000);
    lotteryPresentationAt(outcome, lotteryElapsedAfterPush(held), 99);
    expect(JSON.stringify(outcome)).toBe(before);
    expect(outcome.resultDigits).toEqual([7, 7, 7]);
  });

  it("covers ordinary, green reach, red miss, red jackpot, and rainbow jackpot fixtures", () => {
    expect(createLotteryOutcome(100)).toMatchObject({ holdColor: "blue", reach: false, jackpot: false });
    expect(createLotteryOutcome(30)).toMatchObject({ holdColor: "green", reach: true, jackpot: false });
    expect(createLotteryOutcome(1)).toMatchObject({ holdColor: "red", reach: true, jackpot: false });
    expect(createLotteryOutcome(319)).toMatchObject({ holdColor: "red", reach: true, jackpot: true });
    expect(createLotteryOutcome(1_595)).toMatchObject({ holdColor: "rainbow", reach: true, jackpot: true });
  });

  it("never leaks hot or jackpot confirmation audio into weaker outcomes", () => {
    const ordinary = createLotteryOutcome(100);
    const greenReach = createLotteryOutcome(30);
    const redMiss = createLotteryOutcome(1);
    const jackpot = createLotteryOutcome(319);

    expect(lotteryAudioCueAllowed(ordinary, "hotAlert")).toBe(false);
    expect(lotteryAudioCueAllowed(ordinary, "kyuin")).toBe(false);
    expect(lotteryAudioCueAllowed(greenReach, "storyLaunch")).toBe(true);
    expect(lotteryAudioCueAllowed(greenReach, "hotAlert")).toBe(false);
    expect(lotteryAudioCueAllowed(greenReach, "kyuin")).toBe(false);
    expect(lotteryAudioCueAllowed(redMiss, "hotAlert")).toBe(true);
    expect(lotteryAudioCueAllowed(redMiss, "kyuin")).toBe(false);
    expect(lotteryAudioCueAllowed(redMiss, "rush")).toBe(false);
    expect(lotteryAudioCueAllowed(jackpot, "hotAlert")).toBe(true);
    expect(lotteryAudioCueAllowed(jackpot, "kyuin")).toBe(true);
    expect(lotteryAudioCueAllowed(jackpot, "rush")).toBe(true);
  });

  it("maps the host FREEZE and PUSH boundary to HyperFrames 139/140 at 30 fps", () => {
    const freeze = storyPlaybackPlanAt({ active: true, drawId: 1, elapsedMs: LOTTERY_TIMING.freeze, pushed: false }, true, false, true);
    const resumed = storyPlaybackPlanAt({ active: true, drawId: 1, elapsedMs: LOTTERY_TIMING.result, pushed: true }, true, false, true);
    expect(freeze).toMatchObject({ mediaTimeSeconds: STORY_VIDEO_TIMING.pauseFrame / STORY_VIDEO_TIMING.fps, play: false, reason: "freeze" });
    expect(resumed).toMatchObject({ mediaTimeSeconds: STORY_VIDEO_TIMING.resumeFrame / STORY_VIDEO_TIMING.fps, play: true, reason: "playing" });
  });

  it("holds a miss on the first post-PUSH frame but lets a jackpot continue", () => {
    const clock = { active: true, drawId: 2, elapsedMs: LOTTERY_TIMING.result + 1_000, pushed: true } as const;
    expect(storyPlaybackPlanAt(clock, false, false, true)).toMatchObject({ mediaTimeSeconds: STORY_VIDEO_TIMING.resumeSeconds, play: false, reason: "miss" });
    expect(storyPlaybackPlanAt(clock, true, false, true)).toMatchObject({ mediaTimeSeconds: STORY_VIDEO_TIMING.resumeSeconds + 1, play: true, reason: "playing" });
  });

  it("seeks from the shared clock while hidden and resumes accurately when visible", () => {
    const clock = { active: true, drawId: 3, elapsedMs: 2_000, pushed: false } as const;
    const hidden = storyPlaybackPlanAt(clock, true, false, false);
    const restored = storyPlaybackPlanAt(clock, true, false, true);
    expect(hidden).toMatchObject({ play: false, reason: "hidden" });
    expect(restored).toMatchObject({ mediaTimeSeconds: hidden.mediaTimeSeconds, play: true, reason: "playing" });
  });

  it("keeps reduced-motion playback paused at the deterministic phase frame", () => {
    const plan = storyPlaybackPlanAt({ active: true, drawId: 4, elapsedMs: LOTTERY_TIMING.reach, pushed: false }, true, true, true);
    expect(plan).toMatchObject({ play: false, reason: "reduced-motion" });
    expect(plan.mediaTimeSeconds).toBeGreaterThan(0);
  });
});
