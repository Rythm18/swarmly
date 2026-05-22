import { describe, it, expect } from 'vitest';
import { generateBoard, appendCompletionEntry } from '../board.js';
import type { SwarmConfig } from '../types.js';

const FIXTURE: SwarmConfig = {
  id: 'test-id',
  goal: 'Build a todo CLI',
  workspaceRoot: '/tmp/test',
  createdAt: '2026-05-22T10:00:00Z',
  agents: [
    { label: 'Coordinator 1', role: 'coordinator' },
    { label: 'Builder 1', role: 'builder' },
    { label: 'Reviewer 1', role: 'reviewer' },
  ],
};

describe('board.generateBoard', () => {
  it('includes the swarm id, goal, and timestamp in the header', () => {
    const md = generateBoard(FIXTURE);
    expect(md).toContain('# Swarm Board — test-id');
    expect(md).toContain(FIXTURE.createdAt);
    expect(md).toContain(FIXTURE.goal);
  });

  it('emits a Task Breakdown table with a placeholder for the Coordinator to fill', () => {
    const md = generateBoard(FIXTURE);
    expect(md).toMatch(/## Task Breakdown/);
    expect(md).toContain('Coordinator will populate this table');
  });

  it('creates an Agent Sections heading + one subsection per agent', () => {
    const md = generateBoard(FIXTURE);
    for (const a of FIXTURE.agents) {
      expect(md).toContain(`### ${a.label} (${a.role})`);
    }
  });

  it('every agent section starts in WAITING', () => {
    const md = generateBoard(FIXTURE);
    // 3 agents × one "WAITING" status line each
    const count = (md.match(/\*\*Status:\*\* WAITING/g) || []).length;
    expect(count).toBe(FIXTURE.agents.length);
  });

  it('includes Completed Work Log and Operator Notes sections', () => {
    const md = generateBoard(FIXTURE);
    expect(md).toContain('## Completed Work Log');
    expect(md).toContain('## Operator Notes');
  });
});

describe('board.appendCompletionEntry', () => {
  it('inserts a new bullet right under the Completed Work Log heading', () => {
    const md = generateBoard(FIXTURE);
    const updated = appendCompletionEntry(md, 'T1 done · file.ts · abc1234 · tests passing');
    expect(updated).toContain('- T1 done · file.ts · abc1234 · tests passing');
    // The new entry should appear BEFORE Operator Notes
    const log = updated.indexOf('- T1 done');
    const ops = updated.indexOf('## Operator Notes');
    expect(log).toBeLessThan(ops);
  });

  it('handles a board that does not yet have the marker (appends at end)', () => {
    const stub = '# Hello\n\nNo log here.\n';
    const updated = appendCompletionEntry(stub, 'first entry');
    expect(updated).toContain('## Completed Work Log');
    expect(updated).toContain('- first entry');
  });

  it('appending twice gives two entries in reverse chronological order', () => {
    let md = generateBoard(FIXTURE);
    md = appendCompletionEntry(md, 'first');
    md = appendCompletionEntry(md, 'second');
    const firstIdx = md.indexOf('- first');
    const secondIdx = md.indexOf('- second');
    expect(firstIdx).toBeGreaterThan(-1);
    expect(secondIdx).toBeGreaterThan(-1);
    // appendCompletionEntry inserts after the heading, so the LATER append
    // ends up nearer the top
    expect(secondIdx).toBeLessThan(firstIdx);
  });
});
