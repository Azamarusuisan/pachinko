import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { addNail, deleteNail, loadBoardJson, moveNail, saveBoardJson, selectNail } from "./index.js";

const nail = { id: "editable", positionX: 100, positionY: 200, radius: 1.2, friction: 0.1, restitution: 0.5, enabled: true, group: "editor" } as const;

describe("pure board editor", () => {
  it("selects, nudges in exact editor increments, adds, deletes, saves, and loads", () => {
    const withNail = addNail(createBoardTemplate(), nail);
    expect(selectNail(withNail, nail.id).index).toBe(0);
    const moved = moveNail(moveNail(withNail, nail.id, "RIGHT", 0.1), nail.id, "UP", 0.5);
    expect(selectNail(moved, nail.id).nail).toMatchObject({ positionX: 100.1, positionY: 199.5 });
    const serialized = saveBoardJson(moved);
    expect(loadBoardJson(serialized)).toEqual(moved);
    expect(deleteNail(moved, nail.id).nails).toEqual([]);
  });

  it("rejects unknown and duplicate nail operations", () => {
    expect(() => selectNail(createBoardTemplate(), "missing")).toThrow("Unknown nail");
    const board = addNail(createBoardTemplate(), nail);
    expect(() => addNail(board, nail)).toThrow("Duplicate nail");
  });
});
