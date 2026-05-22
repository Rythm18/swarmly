import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { swarmPaths, findActiveSwarm } from '../paths.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmly-paths-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('paths.swarmPaths', () => {
  it('computes every expected subdirectory under .swarm/<id>/', () => {
    const p = swarmPaths('/work', 'abc123');
    expect(p.baseDir).toBe('/work/.swarm');
    expect(p.swarmDir).toBe('/work/.swarm/abc123');
    expect(p.configFile).toBe('/work/.swarm/abc123/swarm.json');
    expect(p.boardFile).toBe('/work/.swarm/abc123/SWARM_BOARD.md');
    expect(p.agentsFile).toBe('/work/.swarm/abc123/agents.json');
    expect(p.statusDir).toBe('/work/.swarm/abc123/status');
    expect(p.inboxDir).toBe('/work/.swarm/abc123/inbox');
    expect(p.pidsDir).toBe('/work/.swarm/abc123/pids');
    expect(p.logsDir).toBe('/work/.swarm/abc123/logs');
  });
});

describe('paths.findActiveSwarm', () => {
  it('returns null when no .swarm directory exists', () => {
    expect(findActiveSwarm(tmpDir)).toBeNull();
  });

  it('returns null when .swarm exists but is empty', () => {
    fs.mkdirSync(path.join(tmpDir, '.swarm'));
    expect(findActiveSwarm(tmpDir)).toBeNull();
  });

  it('returns the single swarm id when only one exists', () => {
    fs.mkdirSync(path.join(tmpDir, '.swarm', 'onlyone'), { recursive: true });
    expect(findActiveSwarm(tmpDir)).toBe('onlyone');
  });

  it('returns the most recently touched swarm when multiple exist', async () => {
    fs.mkdirSync(path.join(tmpDir, '.swarm', 'old'), { recursive: true });
    // Force an older mtime on the old swarm
    const oldTime = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(tmpDir, '.swarm', 'old'), oldTime, oldTime);

    fs.mkdirSync(path.join(tmpDir, '.swarm', 'new'), { recursive: true });

    expect(findActiveSwarm(tmpDir)).toBe('new');
  });
});
