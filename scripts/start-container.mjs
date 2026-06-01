#!/usr/bin/env node

import { spawn } from "node:child_process";

const children = [];
let shuttingDown = false;

function start(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`\n[${name}] exited${signal ? ` with ${signal}` : ` with code ${code}`}`);
    shutdown(code || 0);
  });
}

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("bridge", "node", ["bridge/server.mjs"]);
start("web", "pnpm", ["start"]);
