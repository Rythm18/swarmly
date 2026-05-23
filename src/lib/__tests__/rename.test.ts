import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renameAgent, DEFAULT_AGENTS } from '../swarm.js';
import { swarmPaths } from '../paths.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmly-rename-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Build a swarm directory on disk WITHOUT spawning real claude processes.
 * We bypass createSwarm (which spawns) and lay down only the files that
 * renameAgent touches: configs, inbox/<label>/, transcripts/<label>.md,
 * status/<label>.json.
 */
function stubSwarm(): { workspaceRoot: string; swarmId: string } {
  const swarmId = 'testswarmid';
  const workspaceRoot = tmpDir;
  const paths = swarmPaths(workspaceRoot, swarmId);
  fs.mkdirSync(paths.swarmDir, { recursive: true });
  fs.mkdirSync(paths.statusDir, { recursive: true });
  fs.mkdirSync(paths.inboxDir, { recursive: true });
  fs.mkdirSync(paths.pidsDir, { recursive: true });
  fs.mkdirSync(paths.logsDir, { recursive: true });
  fs.mkdirSync(path.join(paths.swarmDir, 'transcripts'), { recursive: true });

  const config = {
    id: swarmId,
    goal: 'g',
    workspaceRoot,
    agents: DEFAULT_AGENTS.map((a) => ({ ...a })),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(paths.configFile, JSON.stringify(config, null, 2));
  fs.writeFileSync(paths.agentsFile, JSON.stringify(config.agents, null, 2));
  for (const a of config.agents) {
    fs.mkdirSync(path.join(paths.inboxDir, a.label), { recursive: true });
    fs.writeFileSync(path.join(paths.swarmDir, 'transcripts', `${a.label}.md`), `# ${a.label}\n`);
    fs.writeFileSync(path.join(paths.statusDir, `${a.label}.json`), JSON.stringify({ status: 'idle' }));
  }
  return { workspaceRoot, swarmId };
}

describe('renameAgent — happy path', () => {
  it('renames inbox/transcript/status and updates swarm.json + agents.json', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    renameAgent({ workspaceRoot, swarmId, oldLabel: 'Builder 1', newLabel: 'Backend' });

    const paths = swarmPaths(workspaceRoot, swarmId);
    expect(fs.existsSync(path.join(paths.inboxDir, 'Builder 1'))).toBe(false);
    expect(fs.existsSync(path.join(paths.inboxDir, 'Backend'))).toBe(true);
    expect(fs.existsSync(path.join(paths.swarmDir, 'transcripts', 'Builder 1.md'))).toBe(false);
    expect(fs.existsSync(path.join(paths.swarmDir, 'transcripts', 'Backend.md'))).toBe(true);
    expect(fs.existsSync(path.join(paths.statusDir, 'Builder 1.json'))).toBe(false);
    expect(fs.existsSync(path.join(paths.statusDir, 'Backend.json'))).toBe(true);

    const cfg = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
    const roster = JSON.parse(fs.readFileSync(paths.agentsFile, 'utf8'));
    expect(cfg.agents.find((a: any) => a.label === 'Builder 1')).toBeUndefined();
    expect(cfg.agents.find((a: any) => a.label === 'Backend')).toBeTruthy();
    expect(roster.find((a: any) => a.label === 'Backend')).toBeTruthy();
  });
});

describe('renameAgent — refusals', () => {
  it('refuses when the agent is running (live pidfile)', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    const paths = swarmPaths(workspaceRoot, swarmId);
    fs.writeFileSync(path.join(paths.pidsDir, 'Builder 1.pid'), String(process.pid));
    expect(() =>
      renameAgent({ workspaceRoot, swarmId, oldLabel: 'Builder 1', newLabel: 'Backend' }),
    ).toThrow(/running/i);
  });

  it('refuses when the new label collides with an existing agent', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    expect(() =>
      renameAgent({ workspaceRoot, swarmId, oldLabel: 'Builder 1', newLabel: 'Builder 2' }),
    ).toThrow(/already/i);
  });

  it('refuses when the old label is not in the roster', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    expect(() =>
      renameAgent({ workspaceRoot, swarmId, oldLabel: 'Ghost', newLabel: 'Backend' }),
    ).toThrow(/not found/i);
  });

  it('rejects an empty new label', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    expect(() =>
      renameAgent({ workspaceRoot, swarmId, oldLabel: 'Builder 1', newLabel: '' }),
    ).toThrow(/empty/i);
  });

  it('rejects a new label containing a path separator', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    expect(() =>
      renameAgent({ workspaceRoot, swarmId, oldLabel: 'Builder 1', newLabel: 'A/B' }),
    ).toThrow(/invalid/i);
  });
});

describe('renameAgent — partial state', () => {
  it('does not corrupt config when transcript file is absent', () => {
    const { workspaceRoot, swarmId } = stubSwarm();
    const paths = swarmPaths(workspaceRoot, swarmId);
    fs.unlinkSync(path.join(paths.swarmDir, 'transcripts', 'Builder 1.md'));
    renameAgent({ workspaceRoot, swarmId, oldLabel: 'Builder 1', newLabel: 'Backend' });
    const cfg = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));
    expect(cfg.agents.find((a: any) => a.label === 'Backend')).toBeTruthy();
  });
});
