import fs from 'node:fs';
import pc from 'picocolors';
import { findActiveSwarm, swarmPaths } from '../lib/paths.js';
import { sendMail, checkMail } from '../lib/mailbox.js';
import type { AgentSpec, MailMessage } from '../lib/types.js';

export interface MailSendArgs {
  workspace?: string;
  swarmId?: string;
  as: string;        // sender label, e.g. "Builder 1" or "@operator"
  to: string;        // recipient or "@all"
  body: string;
  type?: MailMessage['type'];
}

export function mailSendCommand(args: MailSendArgs): void {
  const ctx = loadCtx(args.workspace, args.swarmId);
  const msg = sendMail({
    paths: ctx.paths,
    from: args.as,
    to: args.to,
    body: args.body,
    type: args.type,
    knownAgents: ctx.agents,
  });
  console.log(pc.green('✓ sent'));
  console.log(pc.dim(`  ${msg.from} → ${msg.to}  [${msg.type}]  ${msg.id}`));
}

export interface MailCheckArgs {
  workspace?: string;
  swarmId?: string;
  as: string;
  consume?: boolean;
  json?: boolean;
}

export function mailCheckCommand(args: MailCheckArgs): void {
  const ctx = loadCtx(args.workspace, args.swarmId);
  const messages = checkMail({
    paths: ctx.paths,
    agent: args.as,
    consume: args.consume,
  });
  if (args.json) {
    process.stdout.write(JSON.stringify(messages, null, 2) + '\n');
    return;
  }
  if (messages.length === 0) {
    console.log(pc.dim(`(no messages for ${args.as})`));
    return;
  }
  for (const m of messages) {
    const head = `${pc.bold(m.from)} → ${pc.bold(m.to)} ` +
      pc.dim(`[${m.type}] ${m.timestamp}`);
    console.log(head);
    console.log(m.body);
    console.log();
  }
  console.log(pc.dim(`${messages.length} message${messages.length === 1 ? '' : 's'}${args.consume ? ' (consumed)' : ''}`));
}

export function mailAgentsCommand(args: { workspace?: string; swarmId?: string }): void {
  const ctx = loadCtx(args.workspace, args.swarmId);
  console.log(pc.bold('Agents in swarm:'));
  for (const a of ctx.agents) {
    console.log(`  • ${pc.cyan(a.label)} (${a.role})`);
  }
}

function loadCtx(workspace: string | undefined, swarmId: string | undefined) {
  const root = workspace ? workspace : process.cwd();
  const id = swarmId ?? findActiveSwarm(root);
  if (!id) {
    console.error(pc.red('No swarm found in this workspace.'));
    process.exit(1);
  }
  const paths = swarmPaths(root, id);
  if (!fs.existsSync(paths.agentsFile)) {
    console.error(pc.red(`Swarm ${id} has no agents.json — looks corrupted.`));
    process.exit(1);
  }
  const agents = JSON.parse(fs.readFileSync(paths.agentsFile, 'utf8')) as AgentSpec[];
  return { paths, agents };
}
