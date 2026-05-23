import { describe, it, expect } from 'vitest';
import { keyToAction, type Key } from '../keymap.js';
import { initialState } from '../useAppState.js';
import type { AgentRuntime } from '../../lib/types.js';

const agents: AgentRuntime[] = [
  { label: 'Coordinator 1', role: 'coordinator', status: 'idle' },
  { label: 'Builder 1', role: 'builder', status: 'idle' },
  { label: 'Builder 2', role: 'builder', status: 'idle' },
  { label: 'Reviewer 1', role: 'reviewer', status: 'idle' },
];

const active = {
  ...initialState,
  mode: 'active' as const,
  chatTarget: 'Coordinator 1',
};

function press(char: string, key: Partial<Key> = {}): { char: string; key: Key } {
  return { char, key: { tab: false, escape: false, return: false, upArrow: false, downArrow: false, ...key } };
}

describe('keymap — digit hotkeys', () => {
  it('digit with empty input focuses the matching agent', () => {
    const { char, key } = press('2');
    expect(keyToAction(char, key, '', active, agents)).toEqual({ type: 'focus_agent', index: 1, agents });
  });

  it('digit with non-empty input returns null (let TextInput handle it)', () => {
    const { char, key } = press('2');
    expect(keyToAction(char, key, 'hello', active, agents)).toBeNull();
  });

  it('digit out of range returns null', () => {
    const { char, key } = press('9');
    expect(keyToAction(char, key, '', active, agents)).toBeNull();
  });

  it('digit ignored outside active mode', () => {
    const { char, key } = press('2');
    expect(keyToAction(char, key, '', initialState, agents)).toBeNull();
  });
});

describe('keymap — Tab, Esc, arrows', () => {
  it('Tab toggles pane in active mode', () => {
    const { char, key } = press('', { tab: true });
    expect(keyToAction(char, key, '', active, agents)).toEqual({ type: 'toggle_pane' });
  });

  it('Esc toggles right pane in active mode', () => {
    const { char, key } = press('', { escape: true });
    expect(keyToAction(char, key, '', active, agents)).toEqual({ type: 'toggle_right_pane' });
  });

  it('Esc in roster-wizard with rosterRenaming=null cancels the wizard', () => {
    const wiz = { ...initialState, mode: 'roster-wizard' as const, rosterRenaming: null };
    const { char, key } = press('', { escape: true });
    expect(keyToAction(char, key, '', wiz, agents)).toEqual({ type: 'wizard_cancel' });
  });

  it('Esc in roster-wizard with active rename cancels just the rename', () => {
    const wiz = { ...initialState, mode: 'roster-wizard' as const, rosterRenaming: 1 };
    const { char, key } = press('', { escape: true });
    expect(keyToAction(char, key, '', wiz, agents)).toEqual({ type: 'rename_cancel' });
  });

  it('Up/Down in sidebar moves cursor', () => {
    const side = { ...active, activePane: 'sidebar' as const };
    const up = press('', { upArrow: true });
    const down = press('', { downArrow: true });
    expect(keyToAction(up.char, up.key, '', side, agents)).toEqual({ type: 'sidebar_move', delta: -1, agents });
    expect(keyToAction(down.char, down.key, '', side, agents)).toEqual({ type: 'sidebar_move', delta: 1, agents });
  });

  it('Up/Down in input pane returns null (fall through to TextInput)', () => {
    const up = press('', { upArrow: true });
    expect(keyToAction(up.char, up.key, '', active, agents)).toBeNull();
  });

  it('Enter in sidebar commits the cursor to chatTarget', () => {
    const side = { ...active, activePane: 'sidebar' as const };
    const { char, key } = press('', { return: true });
    expect(keyToAction(char, key, '', side, agents)).toEqual({ type: 'sidebar_commit', agents });
  });
});

describe('keymap — help overlay', () => {
  it('? with empty input toggles help overlay', () => {
    const { char, key } = press('?');
    expect(keyToAction(char, key, '', active, agents)).toEqual({ type: 'toggle_help_overlay' });
  });

  it('? with non-empty input returns null', () => {
    const { char, key } = press('?');
    expect(keyToAction(char, key, 'hi', active, agents)).toBeNull();
  });
});
