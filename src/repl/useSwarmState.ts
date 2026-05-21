/**
 * useSwarmState — React hook that mirrors on-disk swarm state into React state.
 *
 * Watches the swarm directory with fs.watch so the TUI re-renders whenever:
 *   - SWARM_BOARD.md changes (task statuses)
 *   - status/<agent>.json updates (agent activity)
 *   - inbox/@operator/ gets new mail
 *   - transcripts/<agent>.md grows
 *
 * Activity feed is debounced and capped so we don't drown the UI.
 */

import { useEffect, useState, useCallback } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import {
  findActiveSwarm,
  swarmPaths,
} from '../lib/paths.js';
import type {
  AgentRuntime,
  AgentSpec,
  AgentStatus,
  SwarmConfig,
} from '../lib/types.js';
import { isAlive, readPid } from '../lib/spawn.js';

export interface ActivityEvent {
  id: string;
  timestamp: number;
  kind: 'mail' | 'status' | 'board' | 'task';
  text: string;
}

export interface BoardTaskRow {
  num: string;
  title: string;
  owner: string;
  status: string;
}

export interface SwarmState {
  config: SwarmConfig | null;
  agents: AgentRuntime[];
  tasks: BoardTaskRow[];
  activity: ActivityEvent[];
}

const MAX_ACTIVITY = 60;

export function useSwarmState(workspaceRoot: string): SwarmState & { reload: () => void } {
  const [state, setState] = useState<SwarmState>({
    config: null,
    agents: [],
    tasks: [],
    activity: [],
  });

  const recompute = useCallback(() => {
    const id = findActiveSwarm(workspaceRoot);
    if (!id) {
      setState({ config: null, agents: [], tasks: [], activity: [] });
      return;
    }
    const paths = swarmPaths(workspaceRoot, id);
    if (!fs.existsSync(paths.configFile)) return;

    const config = JSON.parse(fs.readFileSync(paths.configFile, 'utf8')) as SwarmConfig;
    const agents: AgentRuntime[] = config.agents.map((spec: AgentSpec) => {
      const pid = readPid(paths, spec.label);
      const alive = pid !== null && isAlive(pid);
      const statusFile = path.join(paths.statusDir, `${spec.label}.json`);
      let status: AgentStatus = alive ? 'spawning' : 'dead';
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
        } catch {/* ignore */}
      }
      return { ...spec, pid: pid ?? undefined, status, lastSeen, detail };
    });

    const tasks = parseBoard(paths.boardFile);

    setState((prev) => ({
      ...prev,
      config,
      agents,
      tasks,
    }));
  }, [workspaceRoot]);

  // Initial load + watcher setup
  useEffect(() => {
    recompute();
    const id = findActiveSwarm(workspaceRoot);
    if (!id) return;
    const paths = swarmPaths(workspaceRoot, id);

    // Track last-seen mail files so we can derive new ones
    const seenOpMail = new Set<string>(
      safeReaddir(paths.inboxDir + '/@operator'),
    );

    const debounce = makeDebouncer(150);
    const onChange = (kind: 'board' | 'status' | 'mail', detail: string) => {
      debounce(() => {
        recompute();
        appendActivity(setState, { kind, text: detail });
      });
    };

    const watchers: fs.FSWatcher[] = [];
    const tryWatch = (target: string, onEvent: (filename: string | null) => void) => {
      try {
        if (!fs.existsSync(target)) return;
        const w = fs.watch(target, (_e, filename) => onEvent(filename ? String(filename) : null));
        watchers.push(w);
      } catch {/* fs.watch can be flaky cross-platform; fall back to polling below */}
    };

    tryWatch(paths.swarmDir, (filename) => {
      if (filename === 'SWARM_BOARD.md') onChange('board', 'board updated');
    });
    tryWatch(paths.statusDir, (filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      const agent = filename.replace(/\.json$/, '');
      onChange('status', `${agent} status updated`);
    });

    const operatorInbox = path.join(paths.inboxDir, '@operator');
    tryWatch(operatorInbox, (filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      if (seenOpMail.has(filename)) return;
      seenOpMail.add(filename);
      // Read the mail to surface who/what
      try {
        const fp = path.join(operatorInbox, filename);
        const msg = JSON.parse(fs.readFileSync(fp, 'utf8'));
        onChange('mail', `${msg.from} → @operator [${msg.type}]: ${truncate(msg.body, 80)}`);
      } catch {
        onChange('mail', 'new mail in @operator inbox');
      }
    });

    // Fallback ticker — refresh every 5s in case fs.watch missed an event.
    const ticker = setInterval(recompute, 5000);

    return () => {
      watchers.forEach((w) => w.close());
      clearInterval(ticker);
    };
  }, [workspaceRoot, recompute]);

  return { ...state, reload: recompute };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function appendActivity(
  setState: React.Dispatch<React.SetStateAction<SwarmState>>,
  ev: { kind: ActivityEvent['kind']; text: string },
): void {
  setState((prev) => {
    const next: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      kind: ev.kind,
      text: ev.text,
    };
    const activity = [next, ...prev.activity].slice(0, MAX_ACTIVITY);
    return { ...prev, activity };
  });
}

function parseBoard(boardFile: string): BoardTaskRow[] {
  if (!fs.existsSync(boardFile)) return [];
  try {
    const content = fs.readFileSync(boardFile, 'utf8');
    const idx = content.indexOf('## Task Breakdown');
    if (idx === -1) return [];
    const slice = content.slice(idx).split('## ')[1] ?? '';
    const lines = slice.split('\n');
    const rows: BoardTaskRow[] = [];
    for (const line of lines) {
      if (!line.startsWith('|')) continue;
      // Skip header + separator rows
      if (/^\|\s*-+\s*\|/.test(line)) continue;
      if (/^\|\s*#\s*\|/i.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map((s) => s.trim());
      if (cells.length < 4) continue;
      const num = cells[0];
      if (!/^\d+$/.test(num)) continue; // skip the "Coordinator will populate" placeholder
      rows.push({
        num,
        title: truncate(cells[1] ?? '', 40),
        owner: cells[2] ?? '',
        status: cells[3] ?? '',
      });
    }
    return rows;
  } catch {
    return [];
  }
}

function safeReaddir(dir: string): string[] {
  try { return fs.existsSync(dir) ? fs.readdirSync(dir) : []; } catch { return []; }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function makeDebouncer(ms: number) {
  let t: NodeJS.Timeout | null = null;
  return (fn: () => void) => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}
