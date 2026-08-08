import { parseBoard, type BoardDefinition, type NailDefinition } from "@pachinko/board-schema";

export type NailNudgeMillimeters = 0.1 | 0.5 | 1;
export type NailMoveDirection = "LEFT" | "RIGHT" | "UP" | "DOWN";

export interface NailSelection {
  readonly nailId: string;
  readonly index: number;
  readonly nail: NailDefinition;
}

const roundMillimeter = (value: number): number => Math.round(value * 1000) / 1000;

export function selectNail(board: BoardDefinition, nailId: string): NailSelection {
  const index = board.nails.findIndex((nail) => nail.id === nailId);
  const nail = board.nails[index];
  if (nail === undefined) throw new Error(`Unknown nail: ${nailId}`);
  return { nailId, index, nail };
}

export function moveNail(board: BoardDefinition, nailId: string, direction: NailMoveDirection, amount: NailNudgeMillimeters): BoardDefinition {
  selectNail(board, nailId);
  const vectors: Record<NailMoveDirection, readonly [number, number]> = {
    LEFT: [-amount, 0], RIGHT: [amount, 0], UP: [0, -amount], DOWN: [0, amount],
  };
  const vector = vectors[direction];
  return parseBoard({
    ...board,
    nails: board.nails.map((nail) => nail.id === nailId ? {
      ...nail,
      positionX: roundMillimeter(nail.positionX + vector[0]),
      positionY: roundMillimeter(nail.positionY + vector[1]),
    } : nail),
  });
}

export function addNail(board: BoardDefinition, nail: NailDefinition): BoardDefinition {
  if (board.nails.some((existing) => existing.id === nail.id)) throw new Error(`Duplicate nail: ${nail.id}`);
  return parseBoard({ ...board, nails: [...board.nails, nail] });
}

export function nextAvailableNailId(board: BoardDefinition, prefix = "editor_nail"): string {
  const ids = new Set(board.nails.map((nail) => nail.id));
  let sequence = 1;
  while (ids.has(`${prefix}_${sequence}`)) sequence += 1;
  return `${prefix}_${sequence}`;
}

export function deleteNail(board: BoardDefinition, nailId: string): BoardDefinition {
  selectNail(board, nailId);
  return parseBoard({ ...board, nails: board.nails.filter((nail) => nail.id !== nailId) });
}

export function loadBoardJson(json: string): BoardDefinition {
  const input: unknown = JSON.parse(json);
  return parseBoard(input);
}

export function saveBoardJson(board: BoardDefinition): string {
  return `${JSON.stringify(parseBoard(board), null, 2)}\n`;
}
