#!/usr/bin/env node
/**
 * swarmly — a small CLI for orchestrating multi-agent Claude Code swarms.
 *
 * Subcommands:
 *   start     bootstrap a new swarm in the current workspace
 *   status    show the live state of agents in the active swarm
 *   resume    respawn any dead agents
 *   stop      kill agents and (optionally) uninstall hooks
 *   mail      inter-agent messaging
 *   hooks     install/uninstall the Claude Code status hooks
 */

import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { resumeCommand } from './commands/resume.js';
import { stopCommand } from './commands/stop.js';
import { attachCommand } from './commands/attach.js';
import {
  mailSendCommand,
  mailCheckCommand,
  mailAgentsCommand,
} from './commands/mail.js';
import { hooksInstallCommand, hooksUninstallCommand } from './commands/hooks.js';

const program = new Command();

program
  .name('swarmly')
  .description('Orchestrate multi-agent Claude Code swarms — open source, filesystem-coordinated, no GUI required.')
  .version('0.4.0');

// ── start ─────────────────────────────────────────────────────────────────────
program
  .command('start <goal...>')
  .description('Start a new swarm with the given goal in the current workspace')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('-b, --builders <n>', 'number of builder agents (default 2)', (v) => parseInt(v, 10))
  .option('--no-reviewer', 'skip the reviewer role')
  .option('--no-coordinator', 'skip the coordinator role (advanced)')
  .action((goalParts: string[], opts) => {
    startCommand({
      goal: goalParts.join(' '),
      workspace: opts.workspace,
      builders: opts.builders,
      noReviewer: opts.reviewer === false,
      noCoordinator: opts.coordinator === false,
    });
  });

// ── status ────────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show the state of the active swarm')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .option('--watch', 'refresh every 2 seconds')
  .action((opts) => {
    statusCommand({
      workspace: opts.workspace,
      swarmId: opts.id,
      watch: opts.watch,
    });
  });

// ── resume ────────────────────────────────────────────────────────────────────
program
  .command('resume')
  .description('Respawn any dead agents in the active swarm')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .action((opts) => {
    resumeCommand({ workspace: opts.workspace, swarmId: opts.id });
  });

// ── stop ──────────────────────────────────────────────────────────────────────
program
  .command('stop')
  .description('Kill the swarm and (by default) uninstall hooks')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .option('--keep-hooks', 'leave Claude Code hooks installed')
  .action((opts) => {
    stopCommand({
      workspace: opts.workspace,
      swarmId: opts.id,
      keepHooks: opts.keepHooks,
    });
  });

// ── attach ────────────────────────────────────────────────────────────────────
program
  .command('attach <agent>')
  .description('Follow an agent live: tail its transcript + status (read-only)')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .action((agent, opts) => {
    attachCommand({ agent, workspace: opts.workspace, swarmId: opts.id });
  });

// ── mail ──────────────────────────────────────────────────────────────────────
const mail = program.command('mail').description('Inter-agent messaging');

mail
  .command('send')
  .description('Send a message to an agent (or @all / @operator)')
  .requiredOption('--as <sender>', 'sender label, e.g. "Builder 1" or "@operator"')
  .requiredOption('--to <recipient>', 'recipient label, "@all", or "@operator"')
  .requiredOption('--body <text>', 'message body')
  .option('--type <type>', 'message | status | escalation | worker_done', 'message')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .action((opts) => {
    mailSendCommand({
      as: opts.as,
      to: opts.to,
      body: opts.body,
      type: opts.type,
      workspace: opts.workspace,
      swarmId: opts.id,
    });
  });

mail
  .command('check')
  .description('Read messages for an agent (or @operator)')
  .requiredOption('--as <agent>', 'agent label whose inbox to read')
  .option('--consume', 'delete messages after reading')
  .option('--json', 'output as JSON')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .action((opts) => {
    mailCheckCommand({
      as: opts.as,
      consume: opts.consume,
      json: opts.json,
      workspace: opts.workspace,
      swarmId: opts.id,
    });
  });

mail
  .command('agents')
  .description('List the agents in the active swarm')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .option('--id <swarmId>', 'specific swarm id (defaults to most recent)')
  .action((opts) => {
    mailAgentsCommand({ workspace: opts.workspace, swarmId: opts.id });
  });

// ── hooks ─────────────────────────────────────────────────────────────────────
const hooks = program.command('hooks').description('Manage Claude Code status hooks');

hooks
  .command('install')
  .description('Wire swarmly hooks into the workspace\'s Claude Code settings')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .action((opts) => hooksInstallCommand({ workspace: opts.workspace }));

hooks
  .command('uninstall')
  .description('Remove swarmly hooks from the workspace\'s Claude Code settings')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .action((opts) => hooksUninstallCommand({ workspace: opts.workspace }));

// ── repl (default when no subcommand) ─────────────────────────────────────────
// Bare `swarmly` drops into an interactive TUI. All other subcommands above
// still work as before. The TUI is opt-in via `swarmly repl` too.
program
  .command('repl')
  .description('Open the interactive multi-pane TUI (default when no subcommand)')
  .option('-w, --workspace <path>', 'workspace root (defaults to cwd)')
  .action(async (opts) => {
    const { startRepl } = await import('./repl/index.js');
    startRepl(opts.workspace ?? process.cwd());
  });

// If no args were passed (just `swarmly`), launch the TUI.
if (process.argv.length <= 2) {
  const { startRepl } = await import('./repl/index.js');
  startRepl(process.cwd());
} else {
  program.parseAsync().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
