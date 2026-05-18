/**
 * Filesystem-based inter-agent mailbox.
 *
 * Sender writes <swarmDir>/inbox/<recipient>/<timestamp>-<id>.json.
 * Recipient lists and reads files; --consume deletes after read.
 *
 * Recipient labels are case-sensitive. Special recipients:
 *   "@all"      — fans out to every agent + operator
 *   "@operator" — message to the human; left in inbox/@operator/ for the
 *                 status command to render
 */

import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { MailMessage, SwarmPaths, AgentSpec } from './types.js';

export interface SendOptions {
  paths: SwarmPaths;
  from: string;
  to: string;
  body: string;
  type?: MailMessage['type'];
  /** Optional list of all agent labels — used when to === "@all" */
  knownAgents?: AgentSpec[];
}

export function sendMail(opts: SendOptions): MailMessage {
  const msg: MailMessage = {
    id: nanoid(10),
    from: opts.from,
    to: opts.to,
    type: opts.type ?? 'message',
    body: opts.body,
    timestamp: new Date().toISOString(),
  };

  const recipients = expandRecipients(opts.to, opts.from, opts.knownAgents ?? []);
  for (const r of recipients) {
    writeToInbox(opts.paths.inboxDir, r, msg);
  }
  return msg;
}

export interface CheckOptions {
  paths: SwarmPaths;
  agent: string;
  /** If true, delete messages after reading. */
  consume?: boolean;
}

export function checkMail(opts: CheckOptions): MailMessage[] {
  const dir = path.join(opts.paths.inboxDir, opts.agent);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort(); // timestamps as filename prefix => natural chronological order

  const messages: MailMessage[] = [];
  for (const f of files) {
    const fp = path.join(dir, f);
    try {
      const content = fs.readFileSync(fp, 'utf8');
      messages.push(JSON.parse(content));
      if (opts.consume) fs.unlinkSync(fp);
    } catch {
      // Skip malformed messages — best effort.
    }
  }
  return messages;
}

/** Make sure all inbox subdirectories exist. */
export function ensureInboxes(paths: SwarmPaths, agents: AgentSpec[]): void {
  fs.mkdirSync(paths.inboxDir, { recursive: true });
  for (const a of agents) {
    fs.mkdirSync(path.join(paths.inboxDir, a.label), { recursive: true });
  }
  fs.mkdirSync(path.join(paths.inboxDir, '@operator'), { recursive: true });
}

// ─── internals ───────────────────────────────────────────────────────────────

function expandRecipients(to: string, from: string, agents: AgentSpec[]): string[] {
  if (to !== '@all') return [to];
  // @all fans out to every agent except the sender, plus the operator
  const labels = agents.map((a) => a.label).filter((l) => l !== from);
  return [...labels, '@operator'];
}

function writeToInbox(inboxDir: string, recipient: string, msg: MailMessage): void {
  const dir = path.join(inboxDir, recipient);
  fs.mkdirSync(dir, { recursive: true });
  // Filename: <epoch-ms>-<id>.json — sorts chronologically
  const filename = `${Date.now()}-${msg.id}.json`;
  const tmp = path.join(dir, filename + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(msg, null, 2));
  fs.renameSync(tmp, path.join(dir, filename));
}
