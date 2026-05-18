import pc from 'picocolors';
import { getStatus } from '../lib/swarm.js';
import type { AgentRuntime } from '../lib/types.js';

export interface StatusArgs {
  workspace?: string;
  swarmId?: string;
  /** Continuously refresh (every 2s) until ^C */
  watch?: boolean;
}

export function statusCommand(args: StatusArgs): void {
  const workspaceRoot = args.workspace ? args.workspace : process.cwd();
  if (args.watch) {
    const draw = () => {
      console.clear();
      render(workspaceRoot, args.swarmId);
    };
    draw();
    setInterval(draw, 2000);
  } else {
    render(workspaceRoot, args.swarmId);
  }
}

function render(workspaceRoot: string, swarmId?: string): void {
  let report;
  try {
    report = getStatus(workspaceRoot, swarmId);
  } catch (err: any) {
    console.error(pc.red(err?.message ?? String(err)));
    process.exit(1);
  }

  const { config, agents } = report;
  console.log(pc.bold(pc.cyan(`Swarm ${config.id}`)));
  console.log(pc.dim(`  ${config.workspaceRoot}`));
  console.log(pc.dim(`  created ${config.createdAt}`));
  console.log();
  console.log(pc.bold('Goal'));
  console.log(`  ${truncate(config.goal, 200)}`);
  console.log();

  const headers = ['Agent', 'Role', 'PID', 'Status', 'Last update'];
  const rows = agents.map(rowOf);
  printTable(headers, rows);

  console.log();
  console.log(pc.dim('Hint: `flock mail check --as "@operator"` to read messages addressed to you.'));
}

function rowOf(a: AgentRuntime): string[] {
  const pid = a.pid ? String(a.pid) : pc.dim('—');
  const status = colorStatus(a.status);
  const seen = a.lastSeen ? relativeTime(a.lastSeen) : pc.dim('never');
  return [pc.cyan(a.label), a.role, pid, status, seen];
}

function colorStatus(s: AgentRuntime['status']): string {
  switch (s) {
    case 'working': return pc.green(s);
    case 'idle': return pc.blue(s);
    case 'needs-input': return pc.yellow(s);
    case 'done': return pc.magenta(s);
    case 'dead': return pc.red(s);
    case 'spawning': return pc.dim(s);
    default: return s;
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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// Tiny stripping-color-aware table renderer. Keeps deps minimal.
function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(stripAnsi(h).length, ...rows.map((r) => stripAnsi(r[i] ?? '').length)),
  );
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - stripAnsi(s).length));
  const sep = widths.map((w) => '─'.repeat(w)).join('─┼─');

  console.log(headers.map((h, i) => pc.bold(pad(h, widths[i]))).join(' │ '));
  console.log(sep);
  for (const r of rows) {
    console.log(r.map((c, i) => pad(c ?? '', widths[i])).join(' │ '));
  }
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}
