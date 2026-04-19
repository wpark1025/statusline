#!/usr/bin/env node
// Background worker: fetches Anthropic's /api/oauth/usage endpoint using the
// OAuth token stored locally, writes JSON result to statusline-usage.cache.
"use strict";
const fs    = require("fs");
const path  = require("path");
const https = require("https");

const home = process.env.USERPROFILE || process.env.HOME || "";
const credsFile = path.join(home, ".claude", ".credentials.json");
const cacheFile = path.join(home, ".claude", "statusline-usage.cache");
const tmpFile   = cacheFile + ".tmp";

let token = "";
try {
  const creds = JSON.parse(fs.readFileSync(credsFile, "utf8"));
  token = creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
} catch {}
if (!token) process.exit(1);

const req = https.request({
  host: "api.anthropic.com",
  path: "/api/oauth/usage",
  method: "GET",
  headers: {
    "Authorization": `Bearer ${token}`,
    "anthropic-beta": "oauth-2025-04-20",
  },
  timeout: 8000,
}, res => {
  let body = "";
  res.on("data", c => body += c);
  res.on("end", () => {
    if (res.statusCode !== 200) return;
    try {
      fs.writeFileSync(tmpFile, body);
      try { fs.unlinkSync(cacheFile); } catch {}
      fs.renameSync(tmpFile, cacheFile);
    } catch {}
  });
});
req.on("error", () => {});
req.on("timeout", () => req.destroy());
req.end();
