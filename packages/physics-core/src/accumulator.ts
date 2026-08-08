export interface AccumulatorOptions {
  readonly fixedDt: number;
  readonly maxWallDelta?: number;
  readonly maxStepsPerFrame?: number;
}

export class FixedTimestepAccumulator {
  private accumulator = 0;
  private readonly maxWallDelta: number;
  private readonly maxStepsPerFrame: number;

  constructor(private readonly options: AccumulatorOptions) {
    this.maxWallDelta = options.maxWallDelta ?? 0.25;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? 240;
  }

  advance(wallDeltaSeconds: number, simulationSpeed: number, step: () => void): number {
    const delta = Math.min(Math.max(wallDeltaSeconds, 0), this.maxWallDelta);
    this.accumulator += delta * simulationSpeed;
    let steps = 0;
    while (this.accumulator + Number.EPSILON >= this.options.fixedDt && steps < this.maxStepsPerFrame) {
      step();
      this.accumulator -= this.options.fixedDt;
      steps += 1;
    }
    return this.alpha;
  }

  get alpha(): number { return Math.min(1, Math.max(0, this.accumulator / this.options.fixedDt)); }
  reset(): void { this.accumulator = 0; }
}
