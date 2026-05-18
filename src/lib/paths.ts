/**
 * Path resolution for swarmly.
 *
 * Swarm state lives at <workspace>/.swarm/<id>/. Global config (role prompt
 * overrides) lives at ~/.config/swarmly/. We do NOT use ~/.swarmly to keep with
 * XDG conventions; users can override with $SWARMLY_CONFIG_HOME if they want.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { SwarmPaths } from './types.js';

/** ~/.config/swarmly — or $SWARMLY_CONFIG_HOME if set */
export function configDir(): string {
  if (process.env.SWARMLY_CONFIG_HOME) return process.env.SWARMLY_CONFIG_HOME;
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? path.join(xdg, 'swarmly') : path.join(os.homedir(), '.config', 'swarmly');
}

/** ~/.config/swarmly/roles/ — where users can override prompt templates */
export function userRolesDir(): string {
  return path.join(configDir(), 'roles');
}

/** Built-in role prompts shipped with the package. */
export function builtinRolesDir(): string {
  // dist/cli.js → dist/ → up one to package root → src/prompts/
  // After build, prompts/ should be copied into dist/prompts/ — see package.json files[].
  const here = path.dirname(new URL(import.meta.url).pathname);
  // src/lib/paths.ts → ../prompts (when running ts-node) or dist/lib/paths.js → ../prompts (when built)
  return path.resolve(here, '..', 'prompts');
}

/** Compute every file path used by a single swarm. */
export function swarmPaths(workspaceRoot: string, swarmId: string): SwarmPaths {
  const baseDir = path.join(workspaceRoot, '.swarm');
  const swarmDir = path.join(baseDir, swarmId);
  return {
    baseDir,
    swarmDir,
    configFile: path.join(swarmDir, 'swarm.json'),
    boardFile: path.join(swarmDir, 'SWARM_BOARD.md'),
    agentsFile: path.join(swarmDir, 'agents.json'),
    statusDir: path.join(swarmDir, 'status'),
    inboxDir: path.join(swarmDir, 'inbox'),
    pidsDir: path.join(swarmDir, 'pids'),
    logsDir: path.join(swarmDir, 'logs'),
  };
}

/**
 * Find the (single) active swarm in a workspace. Returns the id, or null if
 * none exists. v0.1 supports one swarm per workspace; if multiple are
 * present we return the most recently created.
 */
export function findActiveSwarm(workspaceRoot: string): string | null {
  const baseDir = path.join(workspaceRoot, '.swarm');
  if (!fs.existsSync(baseDir)) return null;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  if (entries.length === 0) return null;
  // Sort by mtime descending; most recent wins
  const sorted = entries
    .map((e) => ({
      id: e.name,
      mtime: fs.statSync(path.join(baseDir, e.name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return sorted[0].id;
}

/**
 * Path to the hook script we install into Claude Code's settings. It lives
 * inside the package's dist/ so updating swarmly updates the hook.
 */
export function hookScriptPath(): string {
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.resolve(here, '..', 'hook.cjs');
}
