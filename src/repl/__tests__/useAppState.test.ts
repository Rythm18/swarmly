import { describe, it, expect } from 'vitest';
import { appStateReducer, initialState } from '../useAppState.js';
import type { SwarmConfig } from '../../lib/types.js';

describe('appStateReducer — goal_entered', () => {
  it('moves no-swarm → roster-wizard with default roster and the typed goal', () => {
    const next = appStateReducer(initialState, { type: 'goal_entered', text: 'ship audit' });
    expect(next.mode).toBe('roster-wizard');
    expect(next.pendingGoal).toBe('ship audit');
    expect(next.rosterDraft).toEqual([
      { label: 'Coordinator 1', role: 'coordinator' },
      { label: 'Builder 1', role: 'builder' },
      { label: 'Builder 2', role: 'builder' },
      { label: 'Reviewer 1', role: 'reviewer' },
    ]);
    expect(next.rosterCursor).toBe(0);
    expect(next.rosterRenaming).toBeNull();
  });

  it('is a no-op outside no-swarm mode', () => {
    const inWizard = { ...initialState, mode: 'roster-wizard' as const };
    const next = appStateReducer(inWizard, { type: 'goal_entered', text: 'x' });
    expect(next).toBe(inWizard);
  });
});

describe('appStateReducer — swarm_detected', () => {
  it('moves any non-active mode → active and seeds chatTarget from the first agent', () => {
    const config: SwarmConfig = {
      id: 'abc',
      goal: 'g',
      workspaceRoot: '/w',
      agents: [
        { label: 'Coordinator 1', role: 'coordinator' },
        { label: 'Builder 1', role: 'builder' },
      ],
      createdAt: '2026-05-23T00:00:00.000Z',
    };
    const next = appStateReducer(initialState, { type: 'swarm_detected', config });
    expect(next.mode).toBe('active');
    expect(next.chatTarget).toBe('Coordinator 1');
    expect(next.rightPaneView).toBe('transcript');
    expect(next.pendingGoal).toBeNull();
    expect(next.rosterDraft).toBeNull();
  });
});

describe('appStateReducer — wizard navigation', () => {
  const seeded = {
    ...initialState,
    mode: 'roster-wizard' as const,
    pendingGoal: 'g',
    rosterDraft: [
      { label: 'Coordinator 1', role: 'coordinator' as const },
      { label: 'Builder 1', role: 'builder' as const },
      { label: 'Builder 2', role: 'builder' as const },
      { label: 'Reviewer 1', role: 'reviewer' as const },
    ],
    rosterCursor: 0,
    rosterRenaming: null,
  };

  it('wizard_cursor_move clamps to roster length', () => {
    expect(appStateReducer(seeded, { type: 'wizard_cursor_move', delta: 1 }).rosterCursor).toBe(1);
    expect(appStateReducer(seeded, { type: 'wizard_cursor_move', delta: -1 }).rosterCursor).toBe(0);
    const atEnd = { ...seeded, rosterCursor: 3 };
    expect(appStateReducer(atEnd, { type: 'wizard_cursor_move', delta: 1 }).rosterCursor).toBe(3);
  });

  it('rename_start records which row is in rename mode', () => {
    const next = appStateReducer({ ...seeded, rosterCursor: 1 }, { type: 'rename_start' });
    expect(next.rosterRenaming).toBe(1);
  });

  it('rename_cancel clears rosterRenaming and leaves labels untouched', () => {
    const renaming = { ...seeded, rosterRenaming: 2 };
    const next = appStateReducer(renaming, { type: 'rename_cancel' });
    expect(next.rosterRenaming).toBeNull();
    expect(next.rosterDraft?.[2].label).toBe('Builder 2');
  });

  it('rename_commit writes the new label and exits rename mode', () => {
    const renaming = { ...seeded, rosterRenaming: 1 };
    const next = appStateReducer(renaming, { type: 'rename_commit', newLabel: 'Backend' });
    expect(next.rosterDraft?.[1].label).toBe('Backend');
    expect(next.rosterRenaming).toBeNull();
  });

  it('rename_commit is a no-op when rosterRenaming is null', () => {
    const next = appStateReducer(seeded, { type: 'rename_commit', newLabel: 'X' });
    expect(next).toBe(seeded);
  });

  it('wizard_cancel returns to no-swarm and drops the draft', () => {
    const next = appStateReducer(seeded, { type: 'wizard_cancel' });
    expect(next.mode).toBe('no-swarm');
    expect(next.rosterDraft).toBeNull();
    expect(next.pendingGoal).toBeNull();
  });
});
