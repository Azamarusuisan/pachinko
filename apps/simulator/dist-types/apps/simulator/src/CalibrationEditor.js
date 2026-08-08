import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { addNail, deleteNail, loadBoardJson, moveNail, nextAvailableNailId, saveBoardJson } from "@pachinko/board-editor";
import { applyCalibration } from "@pachinko/calibration";
export function CalibrationEditor({ board, onBoard }) {
    const [selectedNailId, setSelectedNailId] = useState(board.nails[0]?.id ?? "");
    const effectiveSelectedNailId = board.nails.some((nail) => nail.id === selectedNailId) ? selectedNailId : board.nails[0]?.id ?? "";
    const physics = board.physics;
    const ball = board.ball;
    const launcher = board.launcher;
    const numeric = (label, value, patch, step = 0.01) => _jsxs("label", { children: [label, _jsx("input", { type: "number", value: value, step: step, onChange: (event) => onBoard(applyCalibration(board, patch(Number(event.target.value)))) })] });
    return _jsxs("details", { className: "calibration", children: [_jsx("summary", { children: "Calibration / Simple Board Editor" }), _jsxs("div", { className: "cal-grid", children: [numeric("Gravity", physics.gravity, (value) => ({ gravity: value }), 0.001), numeric("Gravity Scale", physics.gravityScale, (value) => ({ gravityScale: value })), numeric("Ball Mass (g)", ball.massGrams, (value) => ({ ballMassGrams: value }), 0.01), numeric("Ball Diameter (mm)", ball.diameter, (value) => ({ ballDiameterMillimeters: value }), 0.1), numeric("Ball Restitution", ball.restitution, (value) => ({ ballRestitution: value })), numeric("Ball Friction", ball.friction, (value) => ({ ballFriction: value })), numeric("Linear Damping", physics.linearDamping, (value) => ({ linearDamping: value }), 0.005), numeric("Angular Damping", physics.angularDamping, (value) => ({ angularDamping: value }), 0.005), numeric("Launch Angle", launcher.angleDegrees, (value) => ({ launchAngleDegrees: value }), 0.1), numeric("Launch Min Velocity", launcher.minVelocity, (value) => ({ launchMinVelocity: value }), 0.1), numeric("Launch Max Velocity", launcher.maxVelocity, (value) => ({ launchMaxVelocity: value }), 0.1), numeric("Nail Radius (all, mm)", board.nails[0]?.radius ?? 1.2, (value) => ({ nailRadiusMillimeters: value }), 0.1), numeric("Nail Restitution (all)", board.nails[0]?.restitution ?? 0.5, (value) => ({ nailRestitution: value })), numeric("Nail Friction (all)", board.nails[0]?.friction ?? 0.18, (value) => ({ nailFriction: value })), _jsxs("label", { children: ["Physics Hz", _jsx("select", { value: physics.physicsHz, onChange: (event) => onBoard(applyCalibration(board, { physicsHz: Number(event.target.value) })), children: [120, 240, 480].map((hz) => _jsx("option", { children: hz }, hz)) })] })] }), _jsx("h2", { children: "Nail Editor" }), _jsxs("label", { children: ["Select Nail", _jsx("select", { value: effectiveSelectedNailId, onChange: (event) => setSelectedNailId(event.target.value), children: board.nails.map((nail) => _jsxs("option", { value: nail.id, children: [nail.id, " / ", nail.group] }, nail.id)) })] }), _jsx("div", { className: "nudge-grid", children: [0.1, 0.5, 1].flatMap((amount) => [
                    _jsxs("button", { disabled: effectiveSelectedNailId === "", onClick: () => onBoard(moveNail(board, effectiveSelectedNailId, "LEFT", amount)), children: ["\u2190 ", amount, "mm"] }, `l${amount}`),
                    _jsxs("button", { disabled: effectiveSelectedNailId === "", onClick: () => onBoard(moveNail(board, effectiveSelectedNailId, "RIGHT", amount)), children: ["\u2192 ", amount, "mm"] }, `r${amount}`),
                    _jsxs("button", { disabled: effectiveSelectedNailId === "", onClick: () => onBoard(moveNail(board, effectiveSelectedNailId, "UP", amount)), children: ["\u2191 ", amount, "mm"] }, `u${amount}`),
                    _jsxs("button", { disabled: effectiveSelectedNailId === "", onClick: () => onBoard(moveNail(board, effectiveSelectedNailId, "DOWN", amount)), children: ["\u2193 ", amount, "mm"] }, `d${amount}`),
                ]) }), _jsxs("div", { className: "button-row", children: [_jsx("button", { onClick: () => {
                            const created = { id: nextAvailableNailId(board), positionX: 250, positionY: 250, radius: board.nails[0]?.radius ?? 1.2, friction: board.nails[0]?.friction ?? 0.18, restitution: board.nails[0]?.restitution ?? 0.5, enabled: true, group: "editor" };
                            setSelectedNailId(created.id);
                            onBoard(addNail(board, created));
                        }, children: "Add Nail" }), _jsx("button", { disabled: effectiveSelectedNailId === "", onClick: () => { onBoard(deleteNail(board, effectiveSelectedNailId)); setSelectedNailId(board.nails.find((nail) => nail.id !== effectiveSelectedNailId)?.id ?? ""); }, children: "Delete Nail" })] }), _jsx("p", { className: "note", children: "Every edit revalidates the authoring model and recreates the deterministic world. Drag selection can be added at the renderer input boundary without changing Physics Core." }), _jsxs("div", { className: "button-row", children: [_jsx("button", { onClick: () => {
                            const blob = new Blob([saveBoardJson(board)], { type: "application/json" });
                            const link = document.createElement("a");
                            link.href = URL.createObjectURL(blob);
                            link.download = `${board.id}.json`;
                            link.click();
                            URL.revokeObjectURL(link.href);
                        }, children: "Save Board JSON" }), _jsxs("label", { className: "file-button", children: ["Load Board JSON", _jsx("input", { type: "file", accept: "application/json", onChange: (event) => {
                                    const file = event.target.files?.[0];
                                    if (file !== undefined)
                                        void file.text().then((text) => onBoard(loadBoardJson(text)));
                                } })] })] })] });
}
//# sourceMappingURL=CalibrationEditor.js.map