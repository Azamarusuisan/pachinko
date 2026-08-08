import { runBatch } from "@pachinko/simulation-runner";
self.onmessage = (event) => {
    void runBatch(event.data).then((metrics) => self.postMessage({ ok: true, metrics }), (error) => self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Simulation failed" }));
};
//# sourceMappingURL=simulation.worker.js.map