import type { AgentRuntime } from '../lib/types.js';
import type { AppAction, AppState } from './useAppState.js';

export interface Key {
  tab: boolean;
  escape: boolean;
  return: boolean;
  upArrow: boolean;
  downArrow: boolean;
}

/**
 * Pure key → action translator. Returns null when the keystroke should
 * fall through to the input field (so the user can type literally).
 *
 * The caller (App.tsx) hands us the raw char, the ink Key flags, the current
 * input value, the current AppState, and the live agent roster.
 */
export function keyToAction(
  char: string,
  key: Key,
  input: string,
  state: AppState,
  agents: AgentRuntime[],
): AppAction | null {
  // Tab toggles pane (active mode only).
  if (key.tab) {
    return state.mode === 'active' ? { type: 'toggle_pane' } : null;
  }

  // Esc — context-sensitive.
  if (key.escape) {
    if (state.mode === 'roster-wizard') {
      return state.rosterRenaming !== null ? { type: 'rename_cancel' } : { type: 'wizard_cancel' };
    }
    if (state.mode === 'active') {
      return { type: 'toggle_right_pane' };
    }
    return null;
  }

  // Sidebar pane: arrows + Enter operate on the agent cursor.
  if (state.mode === 'active' && state.activePane === 'sidebar') {
    if (key.upArrow) return { type: 'sidebar_move', delta: -1, agents };
    if (key.downArrow) return { type: 'sidebar_move', delta: 1, agents };
    if (key.return) return { type: 'sidebar_commit', agents };
  }

  // Empty-input hotkeys.
  if (input === '') {
    // Digits → focus agent.
    if (state.mode === 'active' && /^[1-9]$/.test(char)) {
      const idx = parseInt(char, 10) - 1;
      if (idx < agents.length) return { type: 'focus_agent', index: idx, agents };
      return null;
    }
    // ? → help overlay.
    if (char === '?') return { type: 'toggle_help_overlay' };
  }

  return null;
}
