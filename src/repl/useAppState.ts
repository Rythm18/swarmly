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
  | { type: 'swarm_detected'; config: SwarmConfig };

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
    default:
      return state;
  }
}
