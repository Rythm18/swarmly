/**
 * Slash command dispatcher for the swarmly TUI.
 *
 * Each command receives the full input line, the current swarm state, and
 * setters to mutate the TUI's local state (focused agent, pending goal
 * confirmation). Returns a string to push into the output panel, or null.
 */

import { resumeSwarm, stopSwarm } from '../lib/swarm.js';
import { swarmPaths } from '../lib/paths.js';
import { sendMail } from '../lib/mailbox.js';
import type { SwarmState } from './useSwarmState.js';

export interface CommandCtx {
  line: string;
  cwd: string;
  state: SwarmState;
  pushOutput: (line: string) => void;
  /** Force the TUI to re-read swarm state from disk after a mutation. */
  reload: () => void;
}

export const COMMANDS: { name: string; help: string }[] = [
  { name: '/status', help: 'Print current agent statuses' },
  { name: '/board', help: 'Return the right pane to the board view (or press Esc)' },
  { name: '/agents', help: 'List the roster' },
  { name: '/rename <old> <new>', help: 'Rename a stopped agent (use /stop first if running)' },
  { name: '/approve', help: 'Quick-approve: reply "approved" to Coordinator 1' },
  { name: '/resume', help: 'Respawn any dead agents in the active swarm' },
  { name: '/stop', help: 'Tear down the active swarm and uninstall hooks' },
  { name: '/help', help: 'Show this command list' },
  { name: '/quit', help: 'Exit the TUI (alias: /exit)' },
  { name: '/exit', help: 'Exit the TUI (alias: /quit)' },
];

export async function runCommand(ctx: CommandCtx): Promise<string | null> {
  const parts = ctx.line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const rest = ctx.line.trim().slice(cmd.length).trim();

  switch (cmd) {
    case '/help':
    case '/?':
      return COMMANDS.map((c) => `  ${pad(c.name, 28)} ${c.help}`).join('\n');

    case '/status': {
      if (!ctx.state.config) return '(no active swarm)';
      const lines = ctx.state.agents.map(
        (a) => `  ${pad(a.label, 14)} ${pad(a.role, 12)} ${a.status}`,
      );
      return lines.join('\n');
    }

    case '/agents':
      if (!ctx.state.config) return '(no active swarm)';
      return ctx.state.config.agents.map((a) => `  • ${a.label} (${a.role})`).join('\n');

    case '/board':
      return 'Switched to board view.';

    case '/rename': {
      if (!ctx.state.config) return '(no active swarm)';
      const sp = rest.split(/\s+/).filter(Boolean);
      // Allow multi-word old labels by trying longest-match against the roster.
      const labels = ctx.state.agents.map((a) => a.label);
      const sorted = [...labels].sort((a, b) => b.length - a.length);
      let oldLabel: string | null = null;
      let newLabel: string | null = null;
      for (const candidate of sorted) {
        const tokens = candidate.split(/\s+/);
        if (sp.length > tokens.length && tokens.every((t, i) => sp[i] === t)) {
          oldLabel = candidate;
          newLabel = sp.slice(tokens.length).join(' ');
          break;
        }
      }
      if (!oldLabel || !newLabel) return 'Usage: /rename <old agent label> <new label>';
      try {
        const { renameAgent } = await import('../lib/swarm.js');
        renameAgent({
          workspaceRoot: ctx.state.config.workspaceRoot,
          swarmId: ctx.state.config.id,
          oldLabel,
          newLabel,
        });
        return `✓ Renamed "${oldLabel}" → "${newLabel}".`;
      } catch (err: any) {
        return `✗ ${err?.message ?? err}`;
      }
    }

    case '/approve': {
      if (!ctx.state.config) return '(no active swarm)';
      const paths = swarmPaths(ctx.state.config.workspaceRoot, ctx.state.config.id);
      sendMail({
        paths,
        from: '@operator',
        to: 'Coordinator 1',
        body: 'approved',
        type: 'message',
        knownAgents: ctx.state.config.agents,
      });
      return '✓ Approval sent to Coordinator 1.';
    }

    case '/resume': {
      if (!ctx.state.config) return '(no active swarm)';
      try {
        const r = resumeSwarm({ workspaceRoot: ctx.cwd });
        const lines: string[] = [];
        if (r.respawned.length) lines.push(`  respawned: ${r.respawned.join(', ')}`);
        if (r.alreadyRunning.length) lines.push(`  alive: ${r.alreadyRunning.join(', ')}`);
        return lines.join('\n') || '(no changes)';
      } catch (err: any) {
        return `✗ ${err?.message ?? err}`;
      }
    }

    case '/stop': {
      if (!ctx.state.config) return '(no active swarm)';
      const r = stopSwarm({ workspaceRoot: ctx.cwd });
      return `✓ Stopped ${r.config.id}. Killed: ${r.killed.join(', ') || '(none)'}.`;
    }

    case '/quit':
    case '/exit':
      return 'goodbye 👋';

    default:
      return `Unknown command: ${cmd}. Type /help.`;
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
