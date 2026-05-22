import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sendMail, checkMail, ensureInboxes } from '../mailbox.js';
import type { SwarmPaths, AgentSpec } from '../types.js';

let tmpDir: string;
let paths: SwarmPaths;

const AGENTS: AgentSpec[] = [
  { label: 'Coordinator 1', role: 'coordinator' },
  { label: 'Builder 1', role: 'builder' },
  { label: 'Builder 2', role: 'builder' },
  { label: 'Reviewer 1', role: 'reviewer' },
];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmly-mailbox-test-'));
  paths = {
    baseDir: path.join(tmpDir, '.swarm'),
    swarmDir: path.join(tmpDir, '.swarm', 'test'),
    configFile: path.join(tmpDir, '.swarm', 'test', 'swarm.json'),
    boardFile: path.join(tmpDir, '.swarm', 'test', 'SWARM_BOARD.md'),
    agentsFile: path.join(tmpDir, '.swarm', 'test', 'agents.json'),
    statusDir: path.join(tmpDir, '.swarm', 'test', 'status'),
    inboxDir: path.join(tmpDir, '.swarm', 'test', 'inbox'),
    pidsDir: path.join(tmpDir, '.swarm', 'test', 'pids'),
    logsDir: path.join(tmpDir, '.swarm', 'test', 'logs'),
  };
  ensureInboxes(paths, AGENTS);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('mailbox', () => {
  it('sends a message and the recipient can read it', () => {
    const sent = sendMail({
      paths,
      from: '@operator',
      to: 'Builder 1',
      body: 'do the thing',
      knownAgents: AGENTS,
    });
    expect(sent.id).toBeTruthy();
    expect(sent.type).toBe('message'); // default type

    const msgs = checkMail({ paths, agent: 'Builder 1' });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toBe('do the thing');
    expect(msgs[0].from).toBe('@operator');
    expect(msgs[0].to).toBe('Builder 1');
  });

  it('preserves chronological order across multiple sends', () => {
    sendMail({ paths, from: 'A', to: 'Builder 1', body: 'first', knownAgents: AGENTS });
    sendMail({ paths, from: 'A', to: 'Builder 1', body: 'second', knownAgents: AGENTS });
    sendMail({ paths, from: 'A', to: 'Builder 1', body: 'third', knownAgents: AGENTS });

    const msgs = checkMail({ paths, agent: 'Builder 1' });
    expect(msgs.map((m) => m.body)).toEqual(['first', 'second', 'third']);
  });

  it('check without --consume leaves messages in place; with --consume deletes them', () => {
    sendMail({ paths, from: 'A', to: 'Builder 1', body: 'hi', knownAgents: AGENTS });

    const first = checkMail({ paths, agent: 'Builder 1' });
    expect(first).toHaveLength(1);

    const second = checkMail({ paths, agent: 'Builder 1' });
    expect(second).toHaveLength(1); // still there

    const third = checkMail({ paths, agent: 'Builder 1', consume: true });
    expect(third).toHaveLength(1);

    const fourth = checkMail({ paths, agent: 'Builder 1' });
    expect(fourth).toHaveLength(0); // now gone
  });

  it('@all fans out to every agent EXCEPT the sender, plus @operator', () => {
    sendMail({
      paths,
      from: 'Coordinator 1',
      to: '@all',
      body: 'standup',
      knownAgents: AGENTS,
    });

    // Builders + Reviewer + operator all got it
    expect(checkMail({ paths, agent: 'Builder 1' })).toHaveLength(1);
    expect(checkMail({ paths, agent: 'Builder 2' })).toHaveLength(1);
    expect(checkMail({ paths, agent: 'Reviewer 1' })).toHaveLength(1);
    expect(checkMail({ paths, agent: '@operator' })).toHaveLength(1);
    // Sender did NOT receive their own broadcast
    expect(checkMail({ paths, agent: 'Coordinator 1' })).toHaveLength(0);
  });

  it('honors the explicit type field', () => {
    sendMail({
      paths,
      from: 'Builder 1',
      to: 'Coordinator 1',
      body: 'done',
      type: 'worker_done',
      knownAgents: AGENTS,
    });
    const msgs = checkMail({ paths, agent: 'Coordinator 1' });
    expect(msgs[0].type).toBe('worker_done');
  });

  it('returns empty list when checking a recipient with no inbox', () => {
    const msgs = checkMail({ paths, agent: 'Someone Unknown' });
    expect(msgs).toEqual([]);
  });
});
