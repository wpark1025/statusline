#!/usr/bin/env node
// Claude Code 4-line statusline.
// Reads Claude Code statusLine JSON from stdin, prints 4 colored lines:
//   L1: dir · branch(dirty) · commits today · cc version · clock
//   L2: model · session cost · today · 7d · 30d
//   L3: MCP servers (or "none")
//   L4: 5h block reset timer
//
// No external deps beyond node + git.

"use strict";
const fs   = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

// ── Catppuccin Mocha palette (truecolor ANSI) ───────────────────────────────
const rgb = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const C = {
  reset:     "\x1b[0m",
  bold:      "\x1b[1m",
  dim:       "\x1b[2m",
  rosewater: rgb(245, 224, 220),
  flamingo:  rgb(242, 205, 205),
  pink:      rgb(245, 194, 231),
  mauve:     rgb(203, 166, 247),
  red:       rgb(243, 139, 168),
  maroon:    rgb(235, 160, 172),
  peach:     rgb(250, 179, 135),
  yellow:    rgb(249, 226, 175),
  green:     rgb(166, 227, 161),
  teal:      rgb(148, 226, 213),
  sky:       rgb(137, 220, 235),
  sapphire:  rgb(116, 199, 236),
  blue:      rgb(137, 180, 250),
  lavender:  rgb(180, 190, 254),
  text:      rgb(205, 214, 244),
  subtext:   rgb(166, 173, 200),
  overlay:   rgb(147, 153, 178),
  surface:   rgb(69, 71, 90),
};
const wrap = (c, s) => `${c}${s}${C.reset}`;
const SEP = ` ${wrap(C.overlay, "│")} `;

// ── Read stdin ──────────────────────────────────────────────────────────────
function readStdin() {
  try { return fs.readFileSync(0, "utf8"); } catch { return ""; }
}
const raw = readStdin();
let input = {};
try { input = JSON.parse(raw); } catch {}

const get = (o, p) => p.split(".").reduce(
  (a, k) => (a && a[k] !== undefined) ? a[k] : undefined, o);

const cwd         = get(input, "workspace.current_dir") || get(input, "cwd") || process.cwd();
const modelName   = get(input, "model.display_name") || get(input, "model.id") || "unknown";
const modelId     = (get(input, "model.id") || "").toLowerCase();
const styleName   = get(input, "output_style.name") || "default";
const sessionCost = get(input, "cost.total_cost_usd");
const transcript  = get(input, "transcript_path") || "";

// ── Helpers ─────────────────────────────────────────────────────────────────
function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500, ...opts,
    }).trim();
  } catch { return ""; }
}
function git(args) {
  return sh(`git -C "${cwd}" -c core.fsmonitor=false --no-optional-locks ${args}`);
}
function fmtMoney(n) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  if (n < 0.01)  return "$" + n.toFixed(4);
  if (n < 10)    return "$" + n.toFixed(3);
  return "$" + n.toFixed(2);
}
function fmtK(n) {
  if (n === undefined || n === null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function shortenDir(absPath) {
  const home = (process.env.HOME || process.env.USERPROFILE || "").replace(/\\/g, "/");
  let p = absPath.replace(/\\/g, "/");
  if (home && (p === home || p.startsWith(home + "/"))) {
    p = "~" + p.slice(home.length);
  }
  const segs = p.split("/").filter(Boolean);
  if (segs.length <= 3) return p;
  const head = p.startsWith("~") ? "~" : segs[0];
  return `${head}/…/${segs[segs.length - 1]}`;
}

// Read effortLevel from ~/.claude/settings.json (falls back to null).
function readEffort() {
  try {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const cfg = JSON.parse(fs.readFileSync(
      path.join(home, ".claude", "settings.json"), "utf8"));
    return (cfg.effortLevel || "").toLowerCase() || null;
  } catch { return null; }
}

// ── Line 1: dir │ branch │ commits │ version │ model │ effort │ clock ──────
function line1() {
  const dirDisp = shortenDir(cwd);
  const dirPart = wrap(C.sky, dirDisp);

  let branchPart = "";
  const branch = git("symbolic-ref --short HEAD");
  if (branch) {
    const dirty =
      sh(`git -C "${cwd}" --no-optional-locks status --porcelain`).length > 0;
    const sym = dirty ? wrap(C.red, "✗") : wrap(C.green, "✓");
    branchPart = `${wrap(C.green, `(${branch})`)} ${sym}`;
  }

  let commitsPart = "";
  if (branch) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const iso = since.toISOString();
    const n = git(`log --oneline --since="${iso}" --author-date-order`)
      .split("\n").filter(Boolean).length;
    commitsPart = `${wrap(C.subtext, "Commits:")}${wrap(C.peach, n)}`;
  }

  const ccVersion = sh("claude --version").split(/\s+/)[0] || "";
  const versionPart = ccVersion ? wrap(C.mauve, `ver${ccVersion}`) : "";

  const emoji =
    modelId.includes("opus")  ? "🧠" :
    modelId.includes("haiku") ? "⚡" :
    modelId.includes("sonnet") ? "🎵" : "🤖";
  const modelPart = `${emoji} ${wrap(C.mauve, modelName)}`;

  const effort = readEffort();
  const effortColor =
    effort === "high"   ? C.red :
    effort === "medium" ? C.peach :
    effort === "low"    ? C.green : C.subtext;
  const effortPart = effort ? `⚙️ ${wrap(effortColor, effort)}` : "";

  const now = new Date();
  const clock = now.toTimeString().slice(0, 5);
  const clockPart = `🕐 ${wrap(C.yellow, clock)}`;

  const parts = [dirPart, branchPart, commitsPart,
                 modelPart, effortPart, versionPart, clockPart].filter(Boolean);
  return parts.join(SEP);
}

// ── Pricing (per 1M tokens, USD) ─────────────────────────────────────────────
// Rough list prices used for historical cost estimation of .jsonl records.
// Claude Code's live session cost comes from cost.total_cost_usd, so only
// history aggregation uses these.
function ratesFor(modelStr) {
  const m = (modelStr || "").toLowerCase();
  if (m.includes("opus"))   return { in: 15.00, out: 75.00, cw5: 18.75, cw1h: 30.00, cr: 1.50 };
  if (m.includes("haiku"))  return { in:  0.80, out:  4.00, cw5:  1.00, cw1h:  1.60, cr: 0.08 };
  return                           { in:  3.00, out: 15.00, cw5:  3.75, cw1h:  6.00, cr: 0.30 };
}
function costOfUsage(u, modelStr) {
  if (!u) return 0;
  const r = ratesFor(modelStr);
  const cw5  = get(u, "cache_creation.ephemeral_5m_input_tokens") || 0;
  const cw1h = get(u, "cache_creation.ephemeral_1h_input_tokens") || 0;
  const fallbackCw = (u.cache_creation_input_tokens || 0) - cw5 - cw1h;
  const cw5Total = cw5 + Math.max(0, fallbackCw);
  const cr = u.cache_read_input_tokens || 0;
  const inp = u.input_tokens || 0;
  const out = u.output_tokens || 0;
  return (inp * r.in + out * r.out + cw5Total * r.cw5 + cw1h * r.cw1h + cr * r.cr) / 1e6;
}

// ── Walk .jsonl files under ~/.claude/projects for cost history ─────────────
function aggregateHistory() {
  const root = path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude", "projects");
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek  = new Date(now - 7  * DAY);
  const startOfMonth = new Date(now - 30 * DAY);
  const totals = { today: 0, week: 0, month: 0 };
  let files = [];
  try {
    for (const proj of fs.readdirSync(root)) {
      const pdir = path.join(root, proj);
      let st; try { st = fs.statSync(pdir); } catch { continue; }
      if (!st.isDirectory()) continue;
      // Skip projects untouched for >30d
      if (now - st.mtimeMs > 30 * DAY) continue;
      for (const f of fs.readdirSync(pdir)) {
        if (!f.endsWith(".jsonl")) continue;
        const full = path.join(pdir, f);
        let fst; try { fst = fs.statSync(full); } catch { continue; }
        if (now - fst.mtimeMs > 30 * DAY) continue;
        files.push(full);
      }
    }
  } catch { return totals; }

  // Cap the scan budget so the statusline stays snappy
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  files = files.slice(0, 80);

  for (const f of files) {
    let txt; try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
    const lines = txt.split("\n");
    for (const ln of lines) {
      if (!ln) continue;
      let j; try { j = JSON.parse(ln); } catch { continue; }
      const u = get(j, "message.usage");
      if (!u) continue;
      const ts = j.timestamp ? new Date(j.timestamp).getTime() : null;
      if (!ts || ts < startOfMonth.getTime()) continue;
      const modelStr = get(j, "message.model") || modelId;
      const c = costOfUsage(u, modelStr);
      totals.month += c;
      if (ts >= startOfWeek.getTime())  totals.week  += c;
      if (ts >= startOfToday.getTime()) totals.today += c;
    }
  }
  return totals;
}

// ── Line 2: REPO │ 30DAY │ 7DAY │ DAY │ LIVE ───────────────────────────────
function line2() {
  const h = aggregateHistory();
  const repoPart  = `${wrap(C.teal,     "REPO")}  ${wrap(C.green,  fmtMoney(sessionCost))}`;
  const monthPart = `${wrap(C.lavender, "30DAY")} ${wrap(C.peach,  fmtMoney(h.month))}`;
  const weekPart  = `${wrap(C.sapphire, "7DAY")}  ${wrap(C.yellow, fmtMoney(h.week))}`;
  const dayPart   = `${wrap(C.sky,      "DAY")}   ${wrap(C.pink,   fmtMoney(h.today))}`;
  const livePart  = `🔥 ${wrap(C.red, "LIVE")}  ${wrap(C.maroon, fmtMoney(sessionCost))}`;

  return [repoPart, monthPart, weekPart, dayPart, livePart].join(SEP);
}

// ── Line 3: MCP servers ─────────────────────────────────────────────────────
function line3() {
  // Primary source: `claude mcp list` (ground truth, includes plugins).
  // Fallback: user mcpServers in ~/.claude.json.
  let servers = [];
  // `claude mcp list` does live health checks (~6s). Cache for 60s so the
  // statusline stays snappy; refresh in the background when stale.
  const cacheFile = path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    ".claude", "statusline-mcp.cache");
  const CACHE_TTL = 60 * 1000;
  let out = "";
  let cacheFresh = false;
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < CACHE_TTL) cacheFresh = true;
    out = fs.readFileSync(cacheFile, "utf8");
  } catch {}
  let refreshing = false;
  if (!cacheFresh) {
    refreshing = true;
    try {
      const { spawn } = require("child_process");
      // Touch (bump mtime) so concurrent renders don't all fire refreshes.
      try { fs.utimesSync(cacheFile, new Date(), new Date()); }
      catch { try { fs.writeFileSync(cacheFile, out || ""); } catch {} }
      const worker = path.join(__dirname, "statusline-refresh-mcp.js");
      const child = spawn(process.execPath, [worker], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
    } catch {}
  }
  // Never block the statusline on a live mcp list call.
  if (out) {
    for (const raw of out.split("\n")) {
      const ln = raw.trim();
      if (!ln || ln.startsWith("Checking")) continue;
      const sepIdx = ln.lastIndexOf(" - ");
      if (sepIdx < 0) continue;
      const head = ln.slice(0, sepIdx);
      const tail = ln.slice(sepIdx + 3).trim();
      const colonIdx = head.indexOf(": ");
      if (colonIdx < 0) continue;
      let name = head.slice(0, colonIdx).trim();
      name = name.replace(/^plugin:/, "").replace(/^claude\.ai\s+/i, "");
      let status = "ok";
      if (tail.startsWith("✗") || /fail|error/i.test(tail)) status = "fail";
      else if (tail.startsWith("!") || /auth/i.test(tail))  status = "auth";
      servers.push({ name, status });
    }
  }

  if (servers.length === 0) {
    try {
      const cfg = JSON.parse(fs.readFileSync(
        path.join(process.env.USERPROFILE || process.env.HOME || "", ".claude.json"),
        "utf8"));
      const names = Object.keys(cfg.mcpServers || {});
      servers = names.map(n => ({ name: n, status: "ok" }));
    } catch {}
  }

  const prefix = wrap(C.teal, "MCP");
  if (servers.length === 0) {
    const msg = refreshing ? "refreshing…" : "none configured";
    return `${prefix} ${wrap(C.subtext, "(0/0):")} ${wrap(C.overlay, msg)}`;
  }
  const okN = servers.filter(s => s.status === "ok").length;
  const count =
    `${wrap(C.subtext, "(")}${wrap(C.green, okN)}${wrap(C.overlay, "/")}` +
    `${wrap(C.text, servers.length)}${wrap(C.subtext, "):")}`;
  const nameColor = { ok: C.sky, fail: C.red, auth: C.yellow };
  // Cap visible width so the line never wraps and displaces line 4.
  // Terminal width isn't passed in; 110 visible chars is a safe cap for most
  // windows, and overflow collapses into "+N more".
  const MAX_VISIBLE = 110;
  const stripAnsi = s => s.replace(/\x1b\[[0-9;]*m/g, "");
  const visLen = s => stripAnsi(s).length;
  const prefixVis = visLen(`${prefix} ${count} `);
  const sepVis = 2; // ", "
  const shownNames = [];
  let used = prefixVis;
  let hidden = 0;
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i];
    const colored = wrap(nameColor[s.status], s.name);
    const addLen = s.name.length + (shownNames.length ? sepVis : 0);
    const remaining = servers.length - i;
    const reserve = remaining > 1 ? ` +${remaining} more`.length : 0;
    if (used + addLen + reserve > MAX_VISIBLE && shownNames.length > 0) {
      hidden = servers.length - i;
      break;
    }
    shownNames.push(colored);
    used += addLen;
  }
  let shown = shownNames.join(wrap(C.overlay, ", "));
  if (hidden > 0) shown += wrap(C.overlay, ` +${hidden} more`);
  return `${prefix} ${count} ${shown}`;
}

// ── Line 4: 5-hour block reset timer ────────────────────────────────────────
// Anthropic's 5h block resets after an idle gap of 5h+. For long-running
// conversations, the block start is NOT the transcript's first message — it's
// the earliest message of the current contiguous activity cluster (where every
// inter-message gap is <5h). Walk timestamps across all recent project jsonl
// files, sort, and split at the first >5h gap working backward from now.
function findCurrentBlockStart() {
  const FIVE_HOURS = 5 * 60 * 60 * 1000;
  const root = path.join(process.env.USERPROFILE || process.env.HOME || "",
                         ".claude", "projects");
  const LOOKBACK = 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - LOOKBACK;
  const stamps = [];
  try {
    for (const proj of fs.readdirSync(root)) {
      const pdir = path.join(root, proj);
      let s; try { s = fs.statSync(pdir); } catch { continue; }
      if (!s.isDirectory() || s.mtimeMs < cutoff) continue;
      for (const f of fs.readdirSync(pdir)) {
        if (!f.endsWith(".jsonl")) continue;
        const full = path.join(pdir, f);
        let fs2; try { fs2 = fs.statSync(full); } catch { continue; }
        if (fs2.mtimeMs < cutoff) continue;
        let txt; try { txt = fs.readFileSync(full, "utf8"); } catch { continue; }
        for (const ln of txt.split("\n")) {
          if (!ln) continue;
          // Cheap prefix check before JSON.parse
          const i = ln.indexOf(`"timestamp":"`);
          if (i < 0) continue;
          const end = ln.indexOf(`"`, i + 13);
          if (end < 0) continue;
          const t = Date.parse(ln.slice(i + 13, end));
          if (!isNaN(t) && t >= cutoff) stamps.push(t);
        }
      }
    }
  } catch { return null; }

  if (stamps.length === 0) return null;
  stamps.sort((a, b) => a - b);
  let blockStart = stamps[stamps.length - 1];
  for (let i = stamps.length - 2; i >= 0; i--) {
    if (stamps[i + 1] - stamps[i] > FIVE_HOURS) break;
    blockStart = stamps[i];
  }
  return blockStart;
}

// Sum tokens in the current 5h block, broken down by model family.
// Scans ~/.claude/projects/**/*.jsonl for entries with ts >= blockStart.
function blockUsage(blockStart) {
  const root = path.join(process.env.USERPROFILE || process.env.HOME || "",
                         ".claude", "projects");
  const out = { all: 0, sonnet: 0, opus: 0, haiku: 0 };
  let files = [];
  try {
    for (const proj of fs.readdirSync(root)) {
      const pdir = path.join(root, proj);
      let s; try { s = fs.statSync(pdir); } catch { continue; }
      if (!s.isDirectory()) continue;
      if (s.mtimeMs < blockStart) continue;
      for (const f of fs.readdirSync(pdir)) {
        if (!f.endsWith(".jsonl")) continue;
        const full = path.join(pdir, f);
        let fs2; try { fs2 = fs.statSync(full); } catch { continue; }
        if (fs2.mtimeMs < blockStart) continue;
        files.push(full);
      }
    }
  } catch { return out; }

  for (const f of files) {
    let txt; try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const ln of txt.split("\n")) {
      if (!ln) continue;
      let j; try { j = JSON.parse(ln); } catch { continue; }
      const u = get(j, "message.usage");
      if (!u) continue;
      const ts = j.timestamp ? new Date(j.timestamp).getTime() : 0;
      if (ts < blockStart) continue;
      const tokens = (u.input_tokens || 0)
        + (u.output_tokens || 0)
        + (u.cache_creation_input_tokens || 0)
        + (u.cache_read_input_tokens || 0);
      out.all += tokens;
      const m = (get(j, "message.model") || "").toLowerCase();
      if      (m.includes("sonnet")) out.sonnet += tokens;
      else if (m.includes("opus"))   out.opus   += tokens;
      else if (m.includes("haiku"))  out.haiku  += tokens;
    }
  }
  return out;
}

// Render a compact progress bar colored by how full it is.
function pctBar(pct, len = 10) {
  const p = Math.max(0, Math.min(1, pct));
  const filled = Math.round(len * p);
  const color = p >= 0.9 ? C.red : p >= 0.7 ? C.peach : p >= 0.4 ? C.yellow : C.green;
  return wrap(color, "█".repeat(filled)) + wrap(C.surface, "░".repeat(len - filled));
}
function pctText(pct) {
  const p = Math.max(0, Math.min(1, pct));
  const color = p >= 0.9 ? C.red : p >= 0.7 ? C.peach : p >= 0.4 ? C.yellow : C.green;
  return wrap(color, `${Math.round(p * 100)}%`);
}

// Read ~/.claude/statusline-usage.cache (written by the background refresher).
// Fire a background refresh if stale. Returns parsed JSON or null.
function readUsageCache() {
  const cacheFile = path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    ".claude", "statusline-usage.cache");
  const TTL = 60 * 1000;
  let data = null;
  let fresh = false;
  try {
    const st = fs.statSync(cacheFile);
    if (Date.now() - st.mtimeMs < TTL) fresh = true;
    data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {}
  if (!fresh) {
    try {
      const worker = path.join(__dirname, "statusline-refresh-usage.js");
      try { fs.utimesSync(cacheFile, new Date(), new Date()); }
      catch { try { fs.writeFileSync(cacheFile, data ? JSON.stringify(data) : ""); } catch {} }
      const { spawn } = require("child_process");
      const child = spawn(process.execPath, [worker], {
        detached: true, stdio: "ignore", windowsHide: true,
      });
      child.unref();
    } catch {}
  }
  return data;
}

// "Fri 1pm", "today 4pm", "Sun 11am". Short human-readable reset time.
function fmtResetAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const daysFromNow = Math.round((d - new Date(now.toDateString())) / 86400000);
  let hour12 = d.getHours() % 12; if (hour12 === 0) hour12 = 12;
  const mm = d.getMinutes();
  const clk = mm ? `${hour12}:${String(mm).padStart(2, "0")}${d.getHours() < 12 ? "am" : "pm"}`
                 : `${hour12}${d.getHours() < 12 ? "am" : "pm"}`;
  if (sameDay) return `today ${clk}`;
  if (daysFromNow === 1) return `tomorrow ${clk}`;
  const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${dayName} ${clk}`;
}

// Short countdown like "3h 42m" or "2d 5h".
function fmtLeft(ms) {
  if (ms <= 0) return "—";
  const days  = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins  = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function line4() {
  const u = readUsageCache();
  if (!u) {
    return `⏳ ${wrap(C.lavender, "Usage")}${SEP}${wrap(C.overlay, "refreshing…")}`;
  }
  const fiveH  = u.five_hour;
  const week   = u.seven_day;
  const sonnet = u.seven_day_sonnet;
  const opus   = u.seven_day_opus;

  const pct = x => (x && typeof x.utilization === "number") ? x.utilization / 100 : null;
  const pctPart = (label, x) => {
    const p = pct(x);
    if (p === null) return null;
    return `${wrap(C.text, label)} ${pctBar(p, 8)} ${pctText(p)}`;
  };

  const parts = [
    pctPart("5h",     fiveH),
    pctPart("Week",   week),
    pctPart("Sonnet", sonnet),
    pctPart("Opus",   opus),          // null-safe; only shows if plan exposes it
  ].filter(Boolean);

  const resetIso = week && week.resets_at;
  const now = Date.now();
  const resetMs = resetIso ? new Date(resetIso).getTime() - now : null;
  const resetLabel = resetIso
    ? `${wrap(C.subtext, "resets")} ${wrap(C.lavender, fmtResetAt(resetIso))}` +
      (resetMs !== null ? ` ${wrap(C.overlay, `(${fmtLeft(resetMs)} left)`)}` : "")
    : "";

  return `⏳ ${wrap(C.lavender, "Usage")}${SEP}` +
         parts.join(SEP) + (resetLabel ? SEP + resetLabel : "");
}

// ── Emit ────────────────────────────────────────────────────────────────────
process.stdout.write(
  line1() + "\n" +
  line2() + "\n" +
  line3() + "\n" +
  line4() + "\n"
);
