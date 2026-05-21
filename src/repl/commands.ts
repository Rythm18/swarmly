/**
 * Slash command dispatcher for the swarmly TUI.
 *
 * Each command receives the full input line, the current swarm state, and
 * setters to mutate the TUI's local state (focused agent, pending goal
 * confirmation). Returns a string to push into the output panel, or null.
 */

import { createSwarm, resumeSwarm, stopSwarm, DEFAULT_AGENTS } from '../lib/swarm.js';
import { sendMail } from '../lib/mailbox.js';
import { findActiveSwarm, swarmPaths } from '../lib/paths.js';
import type { SwarmState } from './useSwarmState.js';
import fs from 'node:fs';

export interface CommandCtx {
  line: string;
  cwd: string;
  state: SwarmState;
  setFocusedAgent: (label: string | null) => void;
  setPendingGoal: (goal: string | null) => void;
  pushOutput: (line: string) => void;
}

export const COMMANDS: { name: string; help: string }[] = [
  { name: '/start <goal>', help: 'Bootstrap a new swarm in this workspace with the given goal' },
  { name: '/status', help: 'Print current agent statuses' },
  { name: '/board', help: 'Return the right pane to the task board view' },
  { name: '/attach <agent>', help: 'Focus the right pane on a specific agent\'s transcript' },
  { name: '/chat <agent> <text>', help: 'Send a message to an agent as @operator' },
  { name: '/mail <to> <body>', help: 'Send any agent mail as @operator (alias: /chat)' },
  { name: '/approve', help: 'Quick-approve: reply "approved" to Coordinator 1' },
  { name: '/agents', help: 'List the roster' },
  { name: '/resume', help: 'Respawn any dead agents in the active swarm' },
  { name: '/stop', help: 'Tear down the active swarm and uninstall hooks' },
  { name: '/help', help: 'Show this command list' },
  { name: '/quit, /exit', help: 'Exit the TUI' },
];

export async function runCommand(ctx: CommandCtx): Promise<string | null> {
  const parts = ctx.line.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const rest = ctx.line.trim().slice(cmd.length).trim();

  switch (cmd) {
    case '/help':
    case '/?':
      return COMMANDS.map((c) => `  ${pad(c.name, 28)} ${c.help}`).join('\n');

    case '/start': {
      if (!rest) return 'Usage: /start <goal description>';
      try {
        const { config } = createSwarm({
          goal: rest,
          workspaceRoot: ctx.cwd,
          agents: DEFAULT_AGENTS,
        });
        return `✓ Swarm ${config.id} started with ${config.agents.length} agents.`;
      } catch (err: any) {
        return `✗ Failed to start: ${err?.message ?? err}`;
      }
    }

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
      ctx.setFocusedAgent(null);
      return 'Switched to board view.';

    case '/attach': {
      if (!ctx.state.config) return '(no active swarm)';
      const target = rest;
      if (!target) return 'Usage: /attach <agent>';
      if (!ctx.state.agents.some((a) => a.label === target)) {
        return `No agent "${target}". Available: ${ctx.state.agents.map((a) => a.label).join(', ')}`;
      }
      ctx.setFocusedAgent(target);
      return `Focused on ${target}. Type /board to return.`;
    }

    case '/chat': {
      if (!ctx.state.config) return '(no active swarm)';
      const sp = rest.split(/\s+/);
      const target = sp[0];
      const body = sp.slice(1).join(' ').trim();
      if (!target || !body) return 'Usage: /chat <agent> <message>';
      const paths = swarmPaths(ctx.state.config.workspaceRoot, ctx.state.config.id);
      try {
        sendMail({
          paths,
          from: '@operator',
          to: target,
          body,
          type: 'message',
          knownAgents: ctx.state.config.agents,
        });
        ctx.setFocusedAgent(target);
        return `→ ${target}: ${body}`;
      } catch (err: any) {
        return `✗ Failed: ${err?.message ?? err}`;
      }
    }

    case '/mail': {
      if (!ctx.state.config) return '(no active swarm)';
      const sp = rest.split(/\s+/);
      const target = sp[0];
      const body = sp.slice(1).join(' ').trim();
      if (!target || !body) return 'Usage: /mail <recipient> <body>';
      const paths = swarmPaths(ctx.state.config.workspaceRoot, ctx.state.config.id);
      try {
        sendMail({
          paths,
          from: '@operator',
          to: target,
          body,
          type: 'message',
          knownAgents: ctx.state.config.agents,
        });
        return `→ ${target}: ${body}`;
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
