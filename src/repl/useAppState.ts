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
  | { type: 'wizard_cancel' }
  | { type: 'focus_agent'; index: number; agents: AgentRuntime[] }
  | { type: 'toggle_pane' }
  | { type: 'sidebar_move'; delta: number; agents: AgentRuntime[] }
  | { type: 'sidebar_commit'; agents: AgentRuntime[] }
  | { type: 'toggle_right_pane' }
  | { type: 'toggle_help_overlay' }
  | { type: 'agents_changed'; agents: AgentRuntime[] }
  | { type: 'mention_open' }
  | { type: 'mention_cursor_move'; delta: number; max: number }
  | { type: 'mention_close' }
  | { type: 'push_output'; line: string }
  | { type: 'swarm_stopped' };

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
    case 'focus_agent': {
      if (state.mode !== 'active') return state;
      const agent = action.agents[action.index];
      if (!agent) return state;
      return { ...state, chatTarget: agent.label, rightPaneView: 'transcript' };
    }
    case 'toggle_pane': {
      if (state.mode !== 'active') return state;
      return { ...state, activePane: state.activePane === 'input' ? 'sidebar' : 'input' };
    }
    case 'sidebar_move': {
      if (state.mode !== 'active') return state;
      const max = Math.max(0, action.agents.length - 1);
      const next = Math.max(0, Math.min(max, state.sidebarCursor + action.delta));
      return { ...state, sidebarCursor: next };
    }
    case 'sidebar_commit': {
      if (state.mode !== 'active') return state;
      const agent = action.agents[state.sidebarCursor];
      if (!agent) return state;
      return {
        ...state,
        chatTarget: agent.label,
        rightPaneView: 'transcript',
        activePane: 'input',
      };
    }
    case 'toggle_right_pane': {
      if (state.mode !== 'active') return state;
      return { ...state, rightPaneView: state.rightPaneView === 'board' ? 'transcript' : 'board' };
    }
    case 'toggle_help_overlay': {
      return { ...state, helpOverlay: !state.helpOverlay };
    }
    case 'agents_changed': {
      if (state.mode !== 'active' || !state.chatTarget) return state;
      const live = action.agents.filter((a) => a.status !== 'dead');
      const stillThere = live.find((a) => a.label === state.chatTarget);
      if (stillThere) return state;
      const fallback = live[0]?.label ?? null;
      if (!fallback) return state;
      const notice = `(${state.chatTarget} is gone — focus moved to ${fallback}.)`;
      return {
        ...state,
        chatTarget: fallback,
        output: appendOutput(state.output, notice),
      };
    }
    case 'mention_open': {
      return { ...state, mentionOpen: true, mentionCursor: 0 };
    }
    case 'mention_cursor_move': {
      if (!state.mentionOpen) return state;
      const next = Math.max(0, Math.min(action.max, state.mentionCursor + action.delta));
      return { ...state, mentionCursor: next };
    }
    case 'mention_close': {
      if (!state.mentionOpen) return state;
      return { ...state, mentionOpen: false };
    }
    case 'push_output': {
      return { ...state, output: appendOutput(state.output, action.line) };
    }
    case 'swarm_stopped': {
      if (state.mode !== 'active') return state;
      return {
        ...state,
        mode: 'no-swarm',
        chatTarget: null,
        rightPaneView: 'board',
        activePane: 'input',
        sidebarCursor: 0,
      };
    }
    default:
      return state;
  }
}

function appendOutput(output: string[], line: string): string[] {
  const trimmed = output.length >= 100 ? output.slice(output.length - 99) : output;
  return [...trimmed, line];
}
