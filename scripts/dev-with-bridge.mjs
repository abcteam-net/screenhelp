#!/usr/bin/env node

import { spawn } from "node:child_process";

const children = [];

function start(name, args) {
  const child = spawn("pnpm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(`\n[${name}] exited${signal ? ` with ${signal}` : ` with code ${code}`}`);
    shutdown(code || 0);
  });
}

let shuttingDown = false;

function shutdown(code = 0) {
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("bridge", ["bridge"]);
start("dev", ["dev"]);
