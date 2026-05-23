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

describe('appStateReducer — active mode focus + panes', () => {
  const active = {
    ...initialState,
    mode: 'active' as const,
    chatTarget: 'Coordinator 1',
    rightPaneView: 'transcript' as const,
    activePane: 'input' as const,
    sidebarCursor: 0,
  };
  const agents = [
    { label: 'Coordinator 1', role: 'coordinator' as const, status: 'idle' as const },
    { label: 'Builder 1', role: 'builder' as const, status: 'working' as const },
    { label: 'Builder 2', role: 'builder' as const, status: 'idle' as const },
    { label: 'Reviewer 1', role: 'reviewer' as const, status: 'idle' as const },
  ];

  it('focus_agent sets chatTarget by index and switches right pane to transcript', () => {
    const next = appStateReducer({ ...active, rightPaneView: 'board' }, { type: 'focus_agent', index: 2, agents });
    expect(next.chatTarget).toBe('Builder 2');
    expect(next.rightPaneView).toBe('transcript');
  });

  it('focus_agent out-of-range is ignored', () => {
    const next = appStateReducer(active, { type: 'focus_agent', index: 9, agents });
    expect(next).toBe(active);
  });

  it('toggle_pane flips activePane', () => {
    expect(appStateReducer(active, { type: 'toggle_pane' }).activePane).toBe('sidebar');
    expect(appStateReducer({ ...active, activePane: 'sidebar' }, { type: 'toggle_pane' }).activePane).toBe('input');
  });

  it('sidebar_move clamps within agents length', () => {
    const at0 = { ...active, activePane: 'sidebar' as const, sidebarCursor: 0 };
    expect(appStateReducer(at0, { type: 'sidebar_move', delta: 1, agents }).sidebarCursor).toBe(1);
    expect(appStateReducer(at0, { type: 'sidebar_move', delta: -1, agents }).sidebarCursor).toBe(0);
    const atEnd = { ...active, activePane: 'sidebar' as const, sidebarCursor: 3 };
    expect(appStateReducer(atEnd, { type: 'sidebar_move', delta: 1, agents }).sidebarCursor).toBe(3);
  });

  it('sidebar_commit copies cursor → chatTarget and returns to input pane', () => {
    const cursored = { ...active, activePane: 'sidebar' as const, sidebarCursor: 1 };
    const next = appStateReducer(cursored, { type: 'sidebar_commit', agents });
    expect(next.chatTarget).toBe('Builder 1');
    expect(next.activePane).toBe('input');
    expect(next.rightPaneView).toBe('transcript');
  });

  it('toggle_right_pane swaps transcript ↔ board', () => {
    expect(appStateReducer(active, { type: 'toggle_right_pane' }).rightPaneView).toBe('board');
    expect(
      appStateReducer({ ...active, rightPaneView: 'board' }, { type: 'toggle_right_pane' }).rightPaneView,
    ).toBe('transcript');
  });

  it('toggle_help_overlay flips helpOverlay', () => {
    expect(appStateReducer(active, { type: 'toggle_help_overlay' }).helpOverlay).toBe(true);
    expect(
      appStateReducer({ ...active, helpOverlay: true }, { type: 'toggle_help_overlay' }).helpOverlay,
    ).toBe(false);
  });
});

describe('appStateReducer — remap chatTarget when focused agent dies or is renamed', () => {
  const active = {
    ...initialState,
    mode: 'active' as const,
    chatTarget: 'Builder 1',
    rightPaneView: 'transcript' as const,
  };
  it('remaps to first surviving agent if the focused one is gone from roster', () => {
    const agents = [
      { label: 'Coordinator 1', role: 'coordinator' as const, status: 'idle' as const },
      { label: 'Builder 2', role: 'builder' as const, status: 'idle' as const },
    ];
    const next = appStateReducer(active, { type: 'agents_changed', agents });
    expect(next.chatTarget).toBe('Coordinator 1');
    expect(next.output[next.output.length - 1]).toContain('Builder 1');
    expect(next.output[next.output.length - 1]).toContain('Coordinator 1');
  });

  it('remaps to first non-dead agent if the focused one is dead', () => {
    const agents = [
      { label: 'Coordinator 1', role: 'coordinator' as const, status: 'idle' as const },
      { label: 'Builder 1', role: 'builder' as const, status: 'dead' as const },
    ];
    const next = appStateReducer(active, { type: 'agents_changed', agents });
    expect(next.chatTarget).toBe('Coordinator 1');
  });

  it('is a no-op if the focused agent is still alive', () => {
    const agents = [
      { label: 'Builder 1', role: 'builder' as const, status: 'working' as const },
    ];
    const next = appStateReducer(active, { type: 'agents_changed', agents });
    expect(next.chatTarget).toBe('Builder 1');
  });
});

describe('appStateReducer — mention picker', () => {
  const active = { ...initialState, mode: 'active' as const, chatTarget: 'X' };
  it('mention_open sets mentionOpen + resets cursor', () => {
    const next = appStateReducer(active, { type: 'mention_open' });
    expect(next.mentionOpen).toBe(true);
    expect(next.mentionCursor).toBe(0);
  });

  it('mention_cursor_move clamps to [0, max]', () => {
    const open = { ...active, mentionOpen: true, mentionCursor: 0 };
    expect(appStateReducer(open, { type: 'mention_cursor_move', delta: 1, max: 3 }).mentionCursor).toBe(1);
    expect(appStateReducer(open, { type: 'mention_cursor_move', delta: -1, max: 3 }).mentionCursor).toBe(0);
    const atEnd = { ...active, mentionOpen: true, mentionCursor: 3 };
    expect(appStateReducer(atEnd, { type: 'mention_cursor_move', delta: 1, max: 3 }).mentionCursor).toBe(3);
  });

  it('mention_close clears mentionOpen', () => {
    const next = appStateReducer({ ...active, mentionOpen: true }, { type: 'mention_close' });
    expect(next.mentionOpen).toBe(false);
  });

  it('mention_cursor_move is a no-op when picker is closed', () => {
    const closed = { ...active, mentionOpen: false, mentionCursor: 0 };
    const next = appStateReducer(closed, { type: 'mention_cursor_move', delta: 1, max: 3 });
    expect(next).toBe(closed);
  });

  it('mention_close is a no-op when picker is already closed', () => {
    const closed = { ...active, mentionOpen: false };
    const next = appStateReducer(closed, { type: 'mention_close' });
    expect(next).toBe(closed);
  });
});

describe('appStateReducer — push_output', () => {
  it('appends to output, keeping the last 100 lines', () => {
    const long = { ...initialState, output: new Array(100).fill('x') };
    const next = appStateReducer(long, { type: 'push_output', line: 'y' });
    expect(next.output.length).toBe(100);
    expect(next.output[next.output.length - 1]).toBe('y');
  });
});

describe('appStateReducer — swarm_stopped', () => {
  it('moves active → no-swarm and clears chatTarget/right pane', () => {
    const active = {
      ...initialState,
      mode: 'active' as const,
      chatTarget: 'Coordinator 1',
      rightPaneView: 'transcript' as const,
      activePane: 'sidebar' as const,
      sidebarCursor: 2,
    };
    const next = appStateReducer(active, { type: 'swarm_stopped' });
    expect(next.mode).toBe('no-swarm');
    expect(next.chatTarget).toBeNull();
    expect(next.rightPaneView).toBe('board');
    expect(next.activePane).toBe('input');
    expect(next.sidebarCursor).toBe(0);
  });

  it('is a no-op outside active mode', () => {
    const next = appStateReducer(initialState, { type: 'swarm_stopped' });
    expect(next).toBe(initialState);
  });
});
