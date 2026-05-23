import type { AgentSpec, AgentRuntime, SwarmConfig } from '../lib/types.js';
import { DEFAULT_AGENTS } from '../lib/swarm.js';

export type AppMode = 'no-swarm' | 'roster-wizard' | 'active';
export type RightPaneView = 'board' | 'transcript';
export type ActivePane = 'input' | 'sidebar';

export interface AppState {
  mode: AppMode;
  pendingGoal: string | null;
  rosterDraft: AgentSpec[] | null;
  rosterCursor: number;
  rosterRenaming: number | null;
  chatTarget: string | null;
  rightPaneView: RightPaneView;
  activePane: ActivePane;
  sidebarCursor: number;
  mentionOpen: boolean;
  mentionCursor: number;
  helpOverlay: boolean;
  output: string[];
}

export type AppAction =
  | { type: 'goal_entered'; text: string }
  | { type: 'swarm_detected'; config: SwarmConfig }
  | { type: 'wizard_cursor_move'; delta: number }
  | { type: 'rename_start' }
  | { type: 'rename_cancel' }
  | { type: 'rename_commit'; newLabel: string }
  | { type: 'wizard_cancel' };

export const initialState: AppState = {
  mode: 'no-swarm',
  pendingGoal: null,
  rosterDraft: null,
  rosterCursor: 0,
  rosterRenaming: null,
  chatTarget: null,
  rightPaneView: 'board',
  activePane: 'input',
  sidebarCursor: 0,
  mentionOpen: false,
  mentionCursor: 0,
  helpOverlay: false,
  output: ['👋 Welcome to swarmly. Type a goal to start a new swarm.'],
};

export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'goal_entered': {
      if (state.mode !== 'no-swarm') return state;
      return {
        ...state,
        mode: 'roster-wizard',
        pendingGoal: action.text,
        rosterDraft: DEFAULT_AGENTS.map((a) => ({ ...a })),
        rosterCursor: 0,
        rosterRenaming: null,
      };
    }
    case 'swarm_detected': {
      const firstAgent = action.config.agents[0]?.label ?? null;
      return {
        ...state,
        mode: 'active',
        pendingGoal: null,
        rosterDraft: null,
        rosterCursor: 0,
        rosterRenaming: null,
        chatTarget: firstAgent,
        rightPaneView: 'transcript',
        activePane: 'input',
      };
    }
    case 'wizard_cursor_move': {
      if (state.mode !== 'roster-wizard' || !state.rosterDraft) return state;
      const max = state.rosterDraft.length - 1;
      const next = Math.max(0, Math.min(max, state.rosterCursor + action.delta));
      return { ...state, rosterCursor: next };
    }
    case 'rename_start': {
      if (state.mode !== 'roster-wizard' || !state.rosterDraft) return state;
      return { ...state, rosterRenaming: state.rosterCursor };
    }
    case 'rename_cancel': {
      if (state.rosterRenaming === null) return state;
      return { ...state, rosterRenaming: null };
    }
    case 'rename_commit': {
      if (state.rosterRenaming === null || !state.rosterDraft) return state;
      const idx = state.rosterRenaming;
      const draft = state.rosterDraft.map((a, i) => (i === idx ? { ...a, label: action.newLabel } : a));
      return { ...state, rosterDraft: draft, rosterRenaming: null };
    }
    case 'wizard_cancel': {
      if (state.mode !== 'roster-wizard') return state;
      return {
        ...state,
        mode: 'no-swarm',
        pendingGoal: null,
        rosterDraft: null,
        rosterCursor: 0,
        rosterRenaming: null,
      };
    }
    default:
      return state;
  }
}
