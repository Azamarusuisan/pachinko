import { useState } from "react";
import type { BoardDefinition, NailDefinition } from "@pachinko/board-schema";
import { addNail, deleteNail, loadBoardJson, moveNail, nextAvailableNailId, saveBoardJson } from "@pachinko/board-editor";
import { applyCalibration, type CalibrationPatch } from "@pachinko/calibration";

interface Props { readonly board: BoardDefinition; readonly onBoard: (board: BoardDefinition) => void }

export function CalibrationEditor({ board, onBoard }: Props) {
  const [selectedNailId, setSelectedNailId] = useState(board.nails[0]?.id ?? "");
  const effectiveSelectedNailId = board.nails.some((nail) => nail.id === selectedNailId) ? selectedNailId : board.nails[0]?.id ?? "";
  const physics = board.physics;
  const ball = board.ball;
  const launcher = board.launcher;
  const numeric = (label: string, value: number, patch: (value: number) => CalibrationPatch, step = 0.01) => <label>{label}<input type="number" value={value} step={step} onChange={(event) => onBoard(applyCalibration(board, patch(Number(event.target.value))))}/></label>;
  return <details className="calibration"><summary>Calibration / Simple Board Editor</summary>
    <div className="cal-grid">
      {numeric("Gravity", physics.gravity, (value) => ({ gravity: value }), 0.001)}
      {numeric("Gravity Scale", physics.gravityScale, (value) => ({ gravityScale: value }))}
      {numeric("Ball Mass (g)", ball.massGrams, (value) => ({ ballMassGrams: value }), 0.01)}
      {numeric("Ball Diameter (mm)", ball.diameter, (value) => ({ ballDiameterMillimeters: value }), 0.1)}
      {numeric("Ball Restitution", ball.restitution, (value) => ({ ballRestitution: value }))}
      {numeric("Ball Friction", ball.friction, (value) => ({ ballFriction: value }))}
      {numeric("Linear Damping", physics.linearDamping, (value) => ({ linearDamping: value }), 0.005)}
      {numeric("Angular Damping", physics.angularDamping, (value) => ({ angularDamping: value }), 0.005)}
      {numeric("Launch Angle", launcher.angleDegrees, (value) => ({ launchAngleDegrees: value }), 0.1)}
      {numeric("Launch Min Velocity", launcher.minVelocity, (value) => ({ launchMinVelocity: value }), 0.1)}
      {numeric("Launch Max Velocity", launcher.maxVelocity, (value) => ({ launchMaxVelocity: value }), 0.1)}
      {numeric("Nail Radius (all, mm)", board.nails[0]?.radius ?? 1.2, (value) => ({ nailRadiusMillimeters: value }), 0.1)}
      {numeric("Nail Restitution (all)", board.nails[0]?.restitution ?? 0.5, (value) => ({ nailRestitution: value }))}
      {numeric("Nail Friction (all)", board.nails[0]?.friction ?? 0.18, (value) => ({ nailFriction: value }))}
      <label>Physics Hz<select value={physics.physicsHz} onChange={(event) => onBoard(applyCalibration(board, { physicsHz: Number(event.target.value) as 120|240|480 }))}>{[120,240,480].map((hz) => <option key={hz}>{hz}</option>)}</select></label>
    </div>
    <h2>Nail Editor</h2>
    <label>Select Nail<select value={effectiveSelectedNailId} onChange={(event) => setSelectedNailId(event.target.value)}>{board.nails.map((nail) => <option key={nail.id} value={nail.id}>{nail.id} / {nail.group}</option>)}</select></label>
    <div className="nudge-grid">{([0.1,0.5,1] as const).flatMap((amount) => [
      <button disabled={effectiveSelectedNailId === ""} key={`l${amount}`} onClick={() => onBoard(moveNail(board, effectiveSelectedNailId, "LEFT", amount))}>← {amount}mm</button>,
      <button disabled={effectiveSelectedNailId === ""} key={`r${amount}`} onClick={() => onBoard(moveNail(board, effectiveSelectedNailId, "RIGHT", amount))}>→ {amount}mm</button>,
      <button disabled={effectiveSelectedNailId === ""} key={`u${amount}`} onClick={() => onBoard(moveNail(board, effectiveSelectedNailId, "UP", amount))}>↑ {amount}mm</button>,
      <button disabled={effectiveSelectedNailId === ""} key={`d${amount}`} onClick={() => onBoard(moveNail(board, effectiveSelectedNailId, "DOWN", amount))}>↓ {amount}mm</button>,
    ])}</div>
    <div className="button-row"><button onClick={() => {
      const created: NailDefinition = { id: nextAvailableNailId(board), positionX: 250, positionY: 250, radius: board.nails[0]?.radius ?? 1.2, friction: board.nails[0]?.friction ?? 0.18, restitution: board.nails[0]?.restitution ?? 0.5, enabled: true, group: "editor" };
      setSelectedNailId(created.id); onBoard(addNail(board, created));
    }}>Add Nail</button><button disabled={effectiveSelectedNailId === ""} onClick={() => { onBoard(deleteNail(board, effectiveSelectedNailId)); setSelectedNailId(board.nails.find((nail) => nail.id !== effectiveSelectedNailId)?.id ?? ""); }}>Delete Nail</button></div>
    <p className="note">Every edit revalidates the authoring model and recreates the deterministic world. Drag selection can be added at the renderer input boundary without changing Physics Core.</p>
    <div className="button-row"><button onClick={() => {
      const blob = new Blob([saveBoardJson(board)], { type: "application/json" });
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${board.id}.json`; link.click(); URL.revokeObjectURL(link.href);
    }}>Save Board JSON</button><label className="file-button">Load Board JSON<input type="file" accept="application/json" onChange={(event) => {
      const file = event.target.files?.[0]; if (file !== undefined) void file.text().then((text) => onBoard(loadBoardJson(text)));
    }}/></label></div>
  </details>;
}
