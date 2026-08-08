import type { BoardDefinition } from "@pachinko/board-schema";
import { runBatch } from "@pachinko/simulation-runner";

interface Request {
  readonly board: BoardDefinition;
  readonly balls: number;
  readonly seed: number;
  readonly launchPower: number;
  readonly fireRate: 25 | 50 | 75 | 100;
  readonly ccdEnabled: boolean;
}

self.onmessage = (event: MessageEvent<Request>) => {
  void runBatch(event.data).then(
    (metrics) => self.postMessage({ ok: true, metrics }),
    (error: unknown) => self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Simulation failed" }),
  );
};
