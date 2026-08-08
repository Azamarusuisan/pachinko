import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";

export const prototypeBoardUrl = new URL("../../../boards/prototype/eva15_inspired_physics_v1.json", import.meta.url);

export async function loadBoard(url: URL = prototypeBoardUrl): Promise<BoardDefinition> {
  const json: unknown = JSON.parse(await readFile(fileURLToPath(url), "utf8"));
  return parseBoard(json);
}
