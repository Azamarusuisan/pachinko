import { compareWindmillArchitectures } from "./index.js";

process.stdout.write(`${JSON.stringify(await compareWindmillArchitectures(), null, 2)}\n`);
