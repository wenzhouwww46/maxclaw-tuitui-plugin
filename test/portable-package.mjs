import { lstat, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import assert from "node:assert/strict";

const root = new URL("..", import.meta.url).pathname;
const forbidden = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const absolute = join(directory, entry.name);
    const rel = relative(root, absolute).split("/").filter(Boolean);
    if (rel.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))) {
      forbidden.push(rel.join("/"));
    }
    const stat = await lstat(absolute);
    if (stat.isDirectory()) await visit(absolute);
  }
}

await visit(root);
assert.deepEqual(forbidden, [], `MiniMax portable package contains invalid paths:\n${forbidden.join("\n")}`);
console.log("portable package paths: ok");
