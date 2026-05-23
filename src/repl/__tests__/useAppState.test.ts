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
