/**
 * Top-level swarm lifecycle: create, resume, stop, status.
 *
 * Bootstraps the .swarm/<id>/ directory, writes the canonical SWARM_BOARD,
 * spawns agents with role-specific prompts, and provides resume / kill paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import { customAlphabet } from 'nanoid';

import type {
  AgentRuntime,
  AgentSpec,
  SwarmConfig,
  SwarmPaths,
} from './types.js';
import { swarmPaths, builtinRolesDir, userRolesDir, findActiveSwarm } from './paths.js';
import { generateBoard } from './board.js';
import { ensureInboxes } from './mailbox.js';
import {
  spawnAgent,
  isAlive,
  killProcess,
  readPid,
  clearPid,
} from './spawn.js';
import { installHooks, uninstallHooks } from './hooks.js';

// Short, URL-safe swarm IDs: 10 lowercase alnum chars, e.g. "k3p9xq2a7m"
const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

export interface CreateOptions {
  goal: string;
  workspaceRoot: string;
  /** Role roster — defaults to 1 coordinator, 2 builders, 1 reviewer */
  agents?: AgentSpec[];
}

export const DEFAULT_AGENTS: AgentSpec[] = [
  { label: 'Coordinator 1', role: 'coordinator' },
  { label: 'Builder 1', role: 'builder' },
  { label: 'Builder 2', role: 'builder' },
  { label: 'Reviewer 1', role: 'reviewer' },
];

export interface CreateResult {
  config: SwarmConfig;
  paths: SwarmPaths;
  pids: Record<string, number>;
}

export function createSwarm(opts: CreateOptions): CreateResult {
  const agents = opts.agents ?? DEFAULT_AGENTS;
  const id = newId();
  const config: SwarmConfig = {
    id,
    goal: opts.goal,
    workspaceRoot: path.resolve(opts.workspaceRoot),
    agents,
    createdAt: new Date().toISOString(),
  };

  const paths = swarmPaths(config.workspaceRoot, id);
  bootstrapDirs(paths);
  fs.writeFileSync(paths.configFile, JSON.stringify(config, null, 2));
  fs.writeFileSync(paths.agentsFile, JSON.stringify(agents, null, 2));
  fs.writeFileSync(paths.boardFile, generateBoard(config));
  ensureInboxes(paths, agents);

  installHooks(config.workspaceRoot);

  const pids: Record<string, number> = {};
  for (const agent of agents) {
    const prompt = resolvePrompt(agent, config);
    const pid = spawnAgent({ swarm: config, paths, agent, prompt });
    pids[agent.label] = pid;
  }

  return { config, paths, pids };
}

export interface ResumeOptions {
  workspaceRoot: string;
  /** Optional swarm id; if omitted, use the most-recently-touched swarm */
  swarmId?: string;
}

export interface ResumeResult {
  config: SwarmConfig;
  respawned: string[];
  alreadyRunning: string[];
}

/**
 * Re-spawn any agents whose pidfile is missing or whose process has died.
 * Agents that are still alive are left alone.
 */
export function resumeSwarm(opts: ResumeOptions): ResumeResult {
  const config = loadConfig(opts.workspaceRoot, opts.swarmId);
  const paths = swarmPaths(config.workspaceRoot, config.id);

  // Make sure hooks are wired (idempotent — covers the case where the user
  // ran `swarmly hooks uninstall` between sessions).
  installHooks(config.workspaceRoot);

  const respawned: string[] = [];
  const alreadyRunning: string[] = [];

  for (const agent of config.agents) {
    const pid = readPid(paths, agent.label);
    if (pid && isAlive(pid)) {
      alreadyRunning.push(agent.label);
      continue;
    }
    clearPid(paths, agent.label);
    const prompt = resolvePrompt(agent, config);
    spawnAgent({ swarm: config, paths, agent, prompt, resume: true });
    respawned.push(agent.label);
  }
  return { config, respawned, alreadyRunning };
}

export interface StopOptions {
  workspaceRoot: string;
  swarmId?: string;
  /** If true, leave hooks installed; default removes them */
  keepHooks?: boolean;
}

export interface StopResult {
  config: SwarmConfig;
  killed: string[];
}

/**
 * Kill every agent in the swarm, optionally uninstall hooks. Does NOT
 * delete the .swarm/<id>/ directory — the operator may want the board /
 * GAP_ANALYSIS / logs preserved.
 */
export function stopSwarm(opts: StopOptions): StopResult {
  const config = loadConfig(opts.workspaceRoot, opts.swarmId);
  const paths = swarmPaths(config.workspaceRoot, config.id);

  const killed: string[] = [];
  for (const agent of config.agents) {
    const pid = readPid(paths, agent.label);
    if (pid && isAlive(pid)) {
      killProcess(pid, 'SIGTERM');
      killed.push(agent.label);
    }
    clearPid(paths, agent.label);
  }

  if (!opts.keepHooks) {
    uninstallHooks(config.workspaceRoot);
  }
  return { config, killed };
}

export interface StatusReport {
  config: SwarmConfig;
  agents: AgentRuntime[];
}

export function getStatus(workspaceRoot: string, swarmId?: string): StatusReport {
  const config = loadConfig(workspaceRoot, swarmId);
  const paths = swarmPaths(config.workspaceRoot, config.id);

  const agents: AgentRuntime[] = config.agents.map((spec) => {
    const pid = readPid(paths, spec.label);
    const alive = pid !== null && isAlive(pid);
    const statusFile = path.join(paths.statusDir, `${spec.label}.json`);
    let status: AgentRuntime['status'] = alive ? 'spawning' : 'dead';
    let lastSeen: number | undefined;
    let detail: string | undefined;
    if (fs.existsSync(statusFile)) {
      try {
        const rec = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as {
          status?: string; timestamp?: number; title?: string;
        };
        if (rec.status === 'working' || rec.status === 'idle' || rec.status === 'needs-input') {
          status = alive ? rec.status : 'dead';
        }
        lastSeen = rec.timestamp;
        detail = rec.title;
      } catch {
        // ignore
      }
    }
    return {
      ...spec,
      pid: pid ?? undefined,
      status,
      lastSeen,
      detail,
    };
  });

  return { config, agents };
}

export interface RenameOptions {
  workspaceRoot: string;
  swarmId?: string;
  oldLabel: string;
  newLabel: string;
}

/**
 * Rename a stopped agent. Atomically renames inbox/<old>/, transcripts/<old>.md,
 * and status/<old>.json, then updates swarm.json + agents.json. Throws if the
 * agent is currently running (live pidfile) or if the new label collides.
 */
export function renameAgent(opts: RenameOptions): void {
  if (!opts.newLabel || !opts.newLabel.trim()) {
    throw new Error('New label cannot be empty.');
  }
  if (opts.newLabel.includes('/') || opts.newLabel.includes(path.sep)) {
    throw new Error(`Invalid label "${opts.newLabel}" — must not contain path separators.`);
  }

  const config = loadConfig(opts.workspaceRoot, opts.swarmId);
  const paths = swarmPaths(config.workspaceRoot, config.id);

  if (!config.agents.some((a) => a.label === opts.oldLabel)) {
    throw new Error(`Agent "${opts.oldLabel}" not found in swarm ${config.id}.`);
  }
  if (config.agents.some((a) => a.label === opts.newLabel)) {
    throw new Error(`Label already exists: "${opts.newLabel}".`);
  }

  const pid = readPid(paths, opts.oldLabel);
  if (pid && isAlive(pid)) {
    throw new Error(`Agent "${opts.oldLabel}" is running — /stop it first, then rename.`);
  }
  // Stale pidfile — clear it so we leave no orphan.
  clearPid(paths, opts.oldLabel);

  const inboxFrom = path.join(paths.inboxDir, opts.oldLabel);
  const inboxTo = path.join(paths.inboxDir, opts.newLabel);
  const transcriptFrom = path.join(paths.swarmDir, 'transcripts', `${opts.oldLabel}.md`);
  const transcriptTo = path.join(paths.swarmDir, 'transcripts', `${opts.newLabel}.md`);
  const statusFrom = path.join(paths.statusDir, `${opts.oldLabel}.json`);
  const statusTo = path.join(paths.statusDir, `${opts.newLabel}.json`);

  // Best-effort renames. Each target is optional (may not exist yet).
  if (fs.existsSync(inboxFrom)) fs.renameSync(inboxFrom, inboxTo);
  if (fs.existsSync(transcriptFrom)) fs.renameSync(transcriptFrom, transcriptTo);
  if (fs.existsSync(statusFrom)) fs.renameSync(statusFrom, statusTo);

  // Update configs last so a partial filesystem failure doesn't desync them.
  const updated: SwarmConfig = {
    ...config,
    agents: config.agents.map((a) => (a.label === opts.oldLabel ? { ...a, label: opts.newLabel } : a)),
  };
  fs.writeFileSync(paths.configFile, JSON.stringify(updated, null, 2));
  fs.writeFileSync(paths.agentsFile, JSON.stringify(updated.agents, null, 2));
}

// ─── internals ───────────────────────────────────────────────────────────────

function bootstrapDirs(paths: SwarmPaths): void {
  for (const dir of [
    paths.swarmDir,
    paths.statusDir,
    paths.inboxDir,
    paths.pidsDir,
    paths.logsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadConfig(workspaceRoot: string, swarmId?: string): SwarmConfig {
  const id = swarmId ?? findActiveSwarm(workspaceRoot);
  if (!id) {
    throw new Error(
      `No swarm found in ${workspaceRoot}. Run \`swarmly start "<goal>"\` first.`,
    );
  }
  const configFile = swarmPaths(workspaceRoot, id).configFile;
  if (!fs.existsSync(configFile)) {
    throw new Error(`Swarm ${id} has no swarm.json — directory may be corrupted.`);
  }
  return JSON.parse(fs.readFileSync(configFile, 'utf8')) as SwarmConfig;
}

/**
 * Resolve the prompt for an agent. Order of precedence:
 *   1. ~/.config/swarmly/roles/<role>.md  (user override)
 *   2. <package>/dist/prompts/<role>.md (built-in)
 *
 * Then perform variable substitution: {{label}}, {{role}}, {{goal}},
 * {{swarm_id}}, {{board_path}}, {{agent_roster}}.
 */
function resolvePrompt(agent: AgentSpec, config: SwarmConfig): string {
  const candidates = [
    path.join(userRolesDir(), `${agent.role}.md`),
    path.join(builtinRolesDir(), `${agent.role}.md`),
  ];
  const templatePath = candidates.find((p) => fs.existsSync(p));
  if (!templatePath) {
    throw new Error(
      `No prompt template found for role "${agent.role}" — checked: ${candidates.join(', ')}`,
    );
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  const roster = config.agents
    .map((a) => `  - "${a.label}" (${a.role})`)
    .join('\n');
  // {{cli}} resolves to the absolute path of the swarmly binary that spawned
  // this agent. Prompts use `$SWARMLY_CLI` at runtime; the literal path is
  // available too if a template wants to bake it in.
  const cliPath = process.argv[1] ?? 'swarmly';
  return template
    .replaceAll('{{label}}', agent.label)
    .replaceAll('{{role}}', agent.role)
    .replaceAll('{{goal}}', config.goal)
    .replaceAll('{{swarm_id}}', config.id)
    .replaceAll('{{board_path}}', path.relative(config.workspaceRoot, swarmPaths(config.workspaceRoot, config.id).boardFile))
    .replaceAll('{{workspace_root}}', config.workspaceRoot)
    .replaceAll('{{agent_roster}}', roster)
    .replaceAll('{{cli}}', cliPath);
}
