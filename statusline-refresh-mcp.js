#!/usr/bin/env node
// Background worker: runs `claude mcp list`, writes result to the MCP cache.
"use strict";
const fs   = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const home = process.env.USERPROFILE || process.env.HOME || "";
const cacheFile = path.join(home, ".claude", "statusline-mcp.cache");
const tmpFile   = cacheFile + ".tmp";

const child = spawn("claude", ["mcp", "list"], {
  stdio: ["ignore", "pipe", "ignore"],
  shell: true,
  windowsHide: true,
});

let stdout = "";
child.stdout.on("data", d => stdout += d);
child.on("error", () => process.exit(1));
child.on("close", () => {
  if (!stdout) return;
  try {
    fs.writeFileSync(tmpFile, stdout);
    try { fs.unlinkSync(cacheFile); } catch {}
    fs.renameSync(tmpFile, cacheFile);
  } catch {}
});
