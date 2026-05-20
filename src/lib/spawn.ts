/**
 * Subprocess management — spawning Claude Code agents.
 *
 * Each agent is a `claude --dangerously-skip-permissions` process whose
 * system prompt (via stdin) is the role template + swarm context. The PID
 * is written to <swarmDir>/pids/<label>.pid so we can resume / kill later.
 */

import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentSpec, SwarmConfig, SwarmPaths } from './types.js';

export interface SpawnOptions {
  swarm: SwarmConfig;
  paths: SwarmPaths;
  agent: AgentSpec;
  /** Resolved prompt text (role template + swarm context filled in) */
  prompt: string;
  /** If true, this is a resume — agent should re-read board + check mail */
  resume?: boolean;
}

/**
 * Spawn an agent process. Returns the PID of the spawned `claude` process.
 *
 * The agent runs detached so it survives the lifetime of the `swarmly start`
 * command. Stdout and stderr are redirected to log files for debugging.
 */
export function spawnAgent(opts: SpawnOptions): number {
  const { swarm, paths, agent, prompt, resume } = opts;

  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.mkdirSync(paths.pidsDir, { recursive: true });

  const logStream = fs.openSync(
    path.join(paths.logsDir, `${agent.label}.log`),
    'a',
  );

  // Absolute path to the swarmly CLI binary that spawned this agent.
  // Agents reference $SWARMLY_CLI (or the interpolated {{cli}} in their prompt)
  // so commands work even when `swarmly` isn't on PATH inside the spawned shell.
  const swarmlyCliPath = process.argv[1] ?? 'swarmly';

  // The full first message includes the role prompt + a kickoff instruction.
  const resumeNote = `\n\n---\n\nswarmly restarted and is resuming this swarm. Re-read SWARM_BOARD.md, run \`$SWARMLY_CLI mail check --consume --as "${agent.label}"\`, and continue from the current board state.`;
  const firstMessage = resume ? `${prompt}${resumeNote}` : prompt;

  // We pipe stdin so we can deliver the initial message, then close.
  // claude reads the prompt from stdin and proceeds.
  const child: ChildProcess = spawn('claude', ['--dangerously-skip-permissions'], {
    cwd: swarm.workspaceRoot,
    env: {
      ...process.env,
      SWARMLY_SWARM_ID: swarm.id,
      SWARMLY_AGENT_LABEL: agent.label,
      SWARMLY_AGENT_ROLE: agent.role,
      SWARMLY_WORKSPACE_ROOT: swarm.workspaceRoot,
      SWARMLY_CLI: swarmlyCliPath,
    },
    detached: true,
    stdio: ['pipe', logStream, logStream],
  });

  // Deliver the kickoff prompt and close stdin so Claude starts processing.
  child.stdin?.write(firstMessage);
  child.stdin?.end();

  // Let the parent exit without waiting for the child.
  child.unref();

  if (typeof child.pid !== 'number') {
    throw new Error(`Failed to spawn agent ${agent.label} — no pid returned`);
  }

  // Persist the PID for later resume / kill.
  fs.writeFileSync(
    path.join(paths.pidsDir, `${agent.label}.pid`),
    String(child.pid),
    'utf8',
  );

  return child.pid;
}

/** Check whether a process with this PID is alive. Posix-only. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // ESRCH = no such process, EPERM = exists but not ours (count as alive)
    return err?.code === 'EPERM';
  }
}

/** Send SIGTERM to a process; returns true if signaled, false if already dead. */
export function killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/** Read the PID for an agent label, or null if no pidfile exists. */
export function readPid(paths: SwarmPaths, label: string): number | null {
  const file = path.join(paths.pidsDir, `${label}.pid`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8').trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export function clearPid(paths: SwarmPaths, label: string): void {
  const file = path.join(paths.pidsDir, `${label}.pid`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
