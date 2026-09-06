// Node 运行器：node --test game/tests/node/
import test from "node:test";
import { registerTests } from "../cases.mjs";

registerTests((name, fn) => test(name, { timeout: 5000 }, async () => {
  await fn();
}));
