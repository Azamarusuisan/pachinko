import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseBoard } from "@pachinko/board-schema";
import prototypeJson from "../../../boards/prototype/eva15_inspired_physics_v1.json";
import { CalibrationEditor } from "./CalibrationEditor.js";
import { ControlPanel } from "./ControlPanel.js";
import { useSimulation } from "./useSimulation.js";
import { StorySequence } from "./StorySequence.js";
const initialBoard = parseBoard(prototypeJson);
const LEFT_POWER = 0.68;
const RIGHT_POWER = 1;
const initialControls = { power: LEFT_POWER, fireRate: 100, simulationSpeed: 1, ccd: true, autoFire: false };
const LOTTERY_COPY = {
    IDLE: ["", ""], CHANCE: ["前兆発生", "何かが起きる"], REACH: ["リーチ", "決着の瞬間を待て"],
    FREEZE: ["……", "静寂"], RESULT: ["決着", "数字停止"], JACKPOT: ["大当り", "RUSH突入・右打ち"],
};
export function App() {
    const [board, setBoardRaw] = useState(initialBoard);
    const [controls, setControls] = useState(initialControls);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const [drawer, setDrawer] = useState(false);
    const [labMode, setLabMode] = useState(false);
    const [batchStatus, setBatchStatus] = useState("Ready");
    const [batchWorker, setBatchWorker] = useState(null);
    const [previousMetrics, setPreviousMetrics] = useState(null);
    const simulation = useSimulation(board, { ...controls, autoFire: controls.autoFire || spaceHeld });
    const setBoard = useCallback((candidate) => {
        try {
            setBoardRaw(parseBoard(candidate));
            setBatchStatus("Board validated; world recreated.");
        }
        catch (error) {
            setBatchStatus(error instanceof Error ? error.message : "Invalid board JSON");
        }
    }, []);
    const run = useCallback((balls) => {
        batchWorker?.terminate();
        setBatchStatus(`Running ${balls} balls headless…`);
        const worker = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
        setBatchWorker(worker);
        worker.onmessage = (event) => {
            if (event.data.ok && event.data.metrics !== undefined) {
                const metrics = event.data.metrics;
                const comparable = previousMetrics?.ballsLaunched === metrics.ballsLaunched && previousMetrics.seed === metrics.seed;
                const comparison = comparable && previousMetrics !== null ? {
                    startRateDelta: metrics.startRate - previousMetrics.startRate,
                    averageLifetimeDelta: metrics.averageLifetime - previousMetrics.averageLifetime,
                    averageCollisionCountDelta: metrics.averageCollisionCount - previousMetrics.averageCollisionCount,
                    leftRouteRateDelta: metrics.leftRouteRate - previousMetrics.leftRouteRate,
                    centerRouteRateDelta: metrics.centerRouteRate - previousMetrics.centerRouteRate,
                    rightRouteRateDelta: metrics.rightRouteRate - previousMetrics.rightRouteRate,
                } : "Run the same ball count again after calibration to compare.";
                setBatchStatus(JSON.stringify({ metrics, comparisonToPrevious: comparison }, null, 2));
                setPreviousMetrics(metrics);
            }
            else
                setBatchStatus(event.data.error ?? "Simulation failed");
            worker.terminate();
            setBatchWorker(null);
        };
        worker.postMessage({ board, balls, seed: 123456, launchPower: controls.power, fireRate: controls.fireRate, ccdEnabled: controls.ccd });
    }, [batchWorker, board, controls, previousMetrics]);
    useEffect(() => () => batchWorker?.terminate(), [batchWorker]);
    useEffect(() => {
        const down = (event) => { if (event.code === "Space") {
            event.preventDefault();
            setSpaceHeld(true);
        } };
        const up = (event) => { if (event.code === "Space")
            setSpaceHeld(false); };
        const blur = () => setSpaceHeld(false);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);
        return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
    }, []);
    const panel = useMemo(() => _jsxs(_Fragment, { children: [_jsx(ControlPanel, { controls: controls, onControls: setControls, fire: simulation.fire, debug: simulation.debug, onDebug: simulation.setDebug, stats: simulation.stats, onBatch: run, batchStatus: batchStatus }), _jsx(CalibrationEditor, { board: board, onBoard: setBoard })] }), [batchStatus, board, controls, run, setBoard, simulation]);
    return _jsxs("main", { className: `shell ${labMode ? "lab-mode" : "play-mode"}`, children: [_jsxs("header", { className: "play-header", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "REFERENCE PLAY / EVA-15 TYPE" }), _jsx("h1", { children: "\u672A\u6765\u578B\u30D1\u30C1\u30F3\u30B3 \u30B7\u30DF\u30E5\u30EC\u30FC\u30BF\u30FC" })] }), _jsxs("div", { className: "header-actions", children: [_jsx("span", { className: `mode-chip ${simulation.phase === "RUSH" ? "rush" : ""}`, children: simulation.phase === "RUSH" ? "RUSH・右打ち" : "通常・左打ち" }), _jsx("button", { "aria-label": "Controls", onClick: () => { setLabMode(!labMode); setDrawer(!labMode); }, children: labMode ? "遊技へ戻る" : "メニュー" })] })] }), _jsxs("div", { className: "play-data", "aria-label": "\u904A\u6280\u30C7\u30FC\u30BF", children: [_jsxs("div", { children: [_jsx("small", { children: "\u767A\u5C04" }), _jsx("strong", { children: simulation.stats.launched })] }), _jsxs("div", { children: [_jsx("small", { children: "\u30D8\u30BD" }), _jsx("strong", { children: simulation.stats.start })] }), _jsxs("div", { children: [_jsx("small", { children: "\u4FDD\u7559" }), _jsxs("strong", { children: [simulation.holds, "/4"] })] }), _jsxs("div", { children: [_jsx("small", { children: "\u30B9\u30EB\u30FC" }), _jsx("strong", { children: simulation.stats.through })] }), _jsxs("div", { children: [_jsx("small", { children: "\u96FB\u30C1\u30E5\u30FC" }), _jsx("strong", { children: simulation.stats.electricSupport })] }), _jsxs("div", { children: [_jsx("small", { children: "\u30A2\u30BF\u30C3\u30AB\u30FC" }), _jsx("strong", { children: simulation.stats.attacker })] }), _jsxs("div", { children: [_jsx("small", { children: "OUT" }), _jsx("strong", { children: simulation.stats.out })] })] }), _jsxs("div", { className: "layout", children: [_jsxs("section", { className: "machine", children: [_jsxs("div", { className: "machine-top", children: [_jsx("span", { children: "PHYSICAL PLAYFIELD" }), _jsx("i", { children: "REFERENCE MODEL 15" })] }), _jsxs("div", { className: "cabinet-stage", children: [_jsx("img", { className: "cabinet-art", src: "/assets/eva15-reference-cabinet-v2.png", alt: "\u73FE\u4EE3\u65E5\u672C\u6A5F\u306E\u69CB\u9020\u3092\u53C2\u8003\u306B\u3057\u305F\u72EC\u81EA\u610F\u5320\u306E\u30D1\u30C1\u30F3\u30B3\u7B50\u4F53" }), _jsx("div", { className: "board-canvas", ref: simulation.hostRef }), _jsxs("div", { className: `effect-scene ${simulation.lottery.phase.toLowerCase()} ${simulation.phase === "RUSH" && simulation.lottery.phase === "IDLE" ? "rush" : ""}`, children: [simulation.lottery.phase !== "IDLE" && _jsx(StorySequence, { drawId: simulation.lottery.drawId, jackpot: simulation.lottery.jackpot }), _jsx("div", { className: "generated-sequence" })] }), _jsx("div", { className: `lottery-display ${simulation.lottery.phase !== "IDLE" ? "active" : ""}`, children: simulation.lottery.digits.map((digit, index) => _jsx("i", { style: { "--digit-position": `${digit * 11.111}%` } }, `${index}-${digit}`)) }), _jsxs("div", { className: `effect-subtitle ${simulation.lottery.phase.toLowerCase()}`, children: [_jsx("b", { children: LOTTERY_COPY[simulation.lottery.phase][0] }), _jsx("span", { children: LOTTERY_COPY[simulation.lottery.phase][1] })] }), _jsxs("div", { className: "hold-lamps", "aria-label": `保留 ${simulation.holds}`, children: [_jsx("i", { className: "current" }), [0, 1, 2, 3].map((index) => _jsx("i", { className: index < simulation.holds ? "filled" : "" }, index))] }), _jsxs("div", { className: "screen-overlay", children: [_jsx("small", { children: "REFERENCE PLAY" }), _jsx("strong", { children: simulation.phase === "RUSH" ? "右打ち RUSH" : "通常遊技・左打ち" }), _jsx("span", { children: simulation.phase === "RUSH" ? `RUSH ${simulation.rushShots}` : controls.autoFire ? "AUTO PLAY" : "HANDLE READY" })] })] }), _jsxs("div", { className: "machine-console", children: [_jsxs("button", { className: `auto-button ${controls.autoFire ? "active" : ""}`, onClick: () => setControls({ ...controls, autoFire: !controls.autoFire }), children: [_jsx("small", { children: "\u30AA\u30FC\u30C8" }), controls.autoFire ? "停止" : "開始"] }), _jsxs("div", { className: "shot-modes", "aria-label": "\u904A\u6280\u72B6\u614B", children: [_jsx("button", { "aria-pressed": simulation.phase === "NORMAL", disabled: true, children: "\u901A\u5E38\u30FB\u5DE6" }), _jsx("button", { "aria-pressed": simulation.phase === "RUSH", disabled: true, children: "RUSH\u30FB\u53F3" })] }), _jsxs("label", { className: "quick-power", children: [_jsx("span", { children: "\u30CF\u30F3\u30C9\u30EB" }), _jsx("input", { "aria-label": "Launch Power", type: "range", min: "0", max: "1", step: "0.01", value: simulation.phase === "RUSH" ? RIGHT_POWER : LEFT_POWER, disabled: true }), _jsx("output", { children: simulation.phase === "RUSH" ? 100 : 68 })] }), _jsx("button", { className: "handle", onClick: simulation.fire, "aria-label": "\u7389\u3092\u4E00\u767A\u767A\u5C04", children: _jsx("span", { children: "\u767A\u5C04" }) })] })] }), labMode && _jsx("div", { className: `side ${drawer ? "open" : ""}`, children: panel }), labMode && drawer && _jsx("button", { className: "backdrop", "aria-label": "Close controls", onClick: () => setDrawer(false) })] })] });
}
//# sourceMappingURL=App.js.map