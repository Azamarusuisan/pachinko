export interface SeededRng { next(): number; readonly state: number }

export class Mulberry32 implements SeededRng {
  private value: number;

  constructor(seed: number) {
    this.value = seed >>> 0;
  }

  get state(): number { return this.value >>> 0; }

  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let result = this.value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4_294_967_296;
  }
}
