#!/usr/bin/env node
/**
 * swarmly status hook — invoked by Claude Code on UserPromptSubmit / Stop /
 * Notification events for agents swarmly spawned.
 *
 * Reads Claude's stdin JSON payload, derives the swarmly swarm directory from
 * environment variables (set when swarmly spawns the agent), and writes a
 * status JSON file the `swarmly status` command can render.
 *
 * Gated by $SWARMLY_AGENT_LABEL — non-swarmly Claude sessions short-circuit
 * earlier in the shell wrapper and never invoke this script.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const event = (process.argv[2] || '').toLowerCase();

const agentLabel = process.env.SWARMLY_AGENT_LABEL;
const swarmId = process.env.SWARMLY_SWARM_ID;
const workspaceRoot = process.env.SWARMLY_WORKSPACE_ROOT;

if (!agentLabel || !swarmId || !workspaceRoot) {
  // Not a swarmly-spawned session. No-op.
  process.exit(0);
}

const statusDir = path.join(workspaceRoot, '.swarm', swarmId, 'status');

// Drain stdin (Claude Code provides a JSON payload; we don't use most of it
// yet, but read it to avoid a SIGPIPE on the parent's side).
function readStdinSync() {
  try {
    if (process.stdin.isTTY) return '';
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const stdinRaw = readStdinSync();
let payload = null;
try {
  payload = stdinRaw ? JSON.parse(stdinRaw) : null;
} catch {
  payload = null;
}

const eventToStatus = {
  'user-prompt-submit': 'working',
  'stop': 'idle',
  'notification': 'needs-input',
};

const status = eventToStatus[event] || 'idle';
const titles = {
  working: 'Working',
  idle: 'Finished',
  'needs-input': 'Needs input',
};

const record = {
  agent: agentLabel,
  status,
  title: titles[status],
  event,
  timestamp: Date.now(),
  pid: process.ppid, // parent (claude) pid
  cwd: process.cwd(),
  prompt: (payload && typeof payload.prompt === 'string') ? payload.prompt.slice(0, 500) : '',
};

try {
  fs.mkdirSync(statusDir, { recursive: true });
  const tmp = path.join(statusDir, `${agentLabel}.json.tmp`);
  const out = path.join(statusDir, `${agentLabel}.json`);
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2));
  fs.renameSync(tmp, out);
} catch {
  // Best effort — don't let hook failures crash Claude.
}

process.exit(0);
