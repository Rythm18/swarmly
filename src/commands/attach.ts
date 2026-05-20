/**
 * `swarmly attach <agent>` — live read-only follower for a single agent.
 *
 * Tails the agent's transcript + status file. Refreshes on file changes via
 * fs.watch so updates feel instant without polling. ^C exits.
 *
 * Read-only by design — `swarmly chat <agent>` (v0.3) will add the write
 * direction.
 */

import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { findActiveSwarm, swarmPaths } from '../lib/paths.js';
import type { AgentSpec, AgentStatus } from '../lib/types.js';

export interface AttachArgs {
  agent: string;
  workspace?: string;
  swarmId?: string;
}

export function attachCommand(args: AttachArgs): void {
  const root = args.workspace ? args.workspace : process.cwd();
  const id = args.swarmId ?? findActiveSwarm(root);
  if (!id) {
    console.error(pc.red('No swarm found in this workspace.'));
    process.exit(1);
  }
  const paths = swarmPaths(root, id);

  // Validate the agent label
  if (!fs.existsSync(paths.agentsFile)) {
    console.error(pc.red(`Swarm ${id} has no agents.json.`));
    process.exit(1);
  }
  const agents = JSON.parse(fs.readFileSync(paths.agentsFile, 'utf8')) as AgentSpec[];
  if (!agents.some((a) => a.label === args.agent)) {
    console.error(pc.red(`No agent labelled "${args.agent}" in swarm ${id}.`));
    console.error(pc.dim(`  available: ${agents.map((a) => a.label).join(', ')}`));
    process.exit(1);
  }

  const transcriptFile = path.join(paths.swarmDir, 'transcripts', `${args.agent}.md`);
  const statusFile = path.join(paths.statusDir, `${args.agent}.json`);

  let lastTranscriptSize = 0;

  console.log(pc.bold(pc.cyan(`▶ Attached to ${args.agent}`)));
  console.log(pc.dim(`  swarm: ${id}   ^C to detach\n`));

  const renderStatus = () => {
    if (!fs.existsSync(statusFile)) {
      process.stdout.write(pc.dim(`[${args.agent}] (no status yet)              \r`));
      return;
    }
    try {
      const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      const status = colorStatus(s.status as AgentStatus);
      const dt = s.timestamp ? relativeTime(Number(s.timestamp)) : pc.dim('—');
      const title = s.title ? pc.dim(` "${s.title}"`) : '';
      process.stdout.write(
        pc.dim(`[${args.agent}] `) + status + title + pc.dim(` · ${dt}`) + '            \r',
      );
    } catch {
      // ignore parse errors
    }
  };

  const renderTranscript = (force = false) => {
    if (!fs.existsSync(transcriptFile)) {
      if (force) console.log(pc.dim('(no transcript yet — agent hasn\'t logged anything)'));
      return;
    }
    const stat = fs.statSync(transcriptFile);
    if (stat.size === lastTranscriptSize && !force) return;

    // Read just the new bytes if we've already shown some
    if (lastTranscriptSize > 0 && stat.size > lastTranscriptSize) {
      const fd = fs.openSync(transcriptFile, 'r');
      const buf = Buffer.alloc(stat.size - lastTranscriptSize);
      fs.readSync(fd, buf, 0, buf.length, lastTranscriptSize);
      fs.closeSync(fd);
      process.stdout.write('\n' + buf.toString('utf8'));
    } else {
      // First render — show everything
      const content = fs.readFileSync(transcriptFile, 'utf8');
      process.stdout.write('\n' + pc.dim('── transcript ──') + '\n');
      process.stdout.write(content);
    }
    lastTranscriptSize = stat.size;
    renderStatus(); // restore status line after appending
  };

  // Initial paint
  renderTranscript(true);
  renderStatus();

  // Watch for changes. fs.watch is best-effort across platforms but for our
  // single-host case it fires reliably on rename/change events from our own
  // writers.
  const watchers: fs.FSWatcher[] = [];

  const watchIfExists = (p: string, onChange: () => void) => {
    // Watch parent directory so we still see the file appear if it doesn't exist yet
    const dir = path.dirname(p);
    const base = path.basename(p);
    try {
      const w = fs.watch(dir, (_event, filename) => {
        if (filename === base) onChange();
      });
      watchers.push(w);
    } catch (err) {
      // Fall back to polling on the rare platform where fs.watch is unreliable
      setInterval(onChange, 2000).unref();
    }
  };

  watchIfExists(transcriptFile, () => renderTranscript());
  watchIfExists(statusFile, () => renderStatus());

  // Heartbeat to refresh "X seconds ago"
  const heartbeat = setInterval(renderStatus, 5000);

  // Clean exit on ^C
  const cleanup = () => {
    clearInterval(heartbeat);
    watchers.forEach((w) => w.close());
    process.stdout.write('\n' + pc.dim('detached.\n'));
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function colorStatus(s: AgentStatus | string): string {
  switch (s) {
    case 'working': return pc.green(s);
    case 'idle': return pc.blue(s);
    case 'needs-input': return pc.yellow(s);
    case 'done': return pc.magenta(s);
    case 'dead': return pc.red(s);
    case 'spawning': return pc.dim(s);
    default: return String(s);
  }
}

function relativeTime(ms: number): string {
  const dt = Date.now() - ms;
  if (dt < 0) return 'in the future';
  if (dt < 60_000) return `${Math.round(dt / 1000)}s ago`;
  if (dt < 3_600_000) return `${Math.round(dt / 60_000)}m ago`;
  if (dt < 86_400_000) return `${Math.round(dt / 3_600_000)}h ago`;
  return `${Math.round(dt / 86_400_000)}d ago`;
}
