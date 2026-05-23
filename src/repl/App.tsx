/**
 * Top-level Ink TUI for swarmly.
 *
 * Thin renderer over useReducer(appStateReducer) — see ./useAppState.ts for the
 * full state machine. Keystrokes are translated by ./keymap.ts and dispatched
 * here; the only local component state is the input buffer, terminal size, and
 * the wizard rename buffer.
 */

import React, { useReducer, useState, useMemo, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { useSwarmState } from './useSwarmState.js';
import { runCommand } from './commands.js';
import { rtkAvailable } from './ambient.js';
import { appStateReducer, initialState } from './useAppState.js';
import { keyToAction } from './keymap.js';
import { detectMention, applyMention, parseLeadingMention } from './mention.js';
import { Header } from './components/Header.js';
import { AgentsPane } from './components/AgentsPane.js';
import { BoardPane } from './components/BoardPane.js';
import { TranscriptPane } from './components/TranscriptPane.js';
import { ActivityPane } from './components/ActivityPane.js';
import { RosterWizard } from './components/RosterWizard.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { InputBar } from './components/InputBar.js';
import { filterCandidates } from './components/MentionPicker.js';
import { createSwarm } from '../lib/swarm.js';
import { sendMail } from '../lib/mailbox.js';
import { swarmPaths } from '../lib/paths.js';

interface AppProps { cwd: string; }

export const App: React.FC<AppProps> = ({ cwd }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout?.columns ?? 100);
  const [rows, setRows] = useState(stdout?.rows ?? 30);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => { setCols(stdout.columns ?? 100); setRows(stdout.rows ?? 30); };
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  const swarm = useSwarmState(cwd);
  const rtkOn = useMemo(() => rtkAvailable(), []);

  const [state, dispatch] = useReducer(appStateReducer, initialState);
  const [input, setInput] = useState('');
  const [renameBuffer, setRenameBuffer] = useState('');

  // Derived: mention picker visibility — derived from input + cursor position.
  const mention = useMemo(
    () => state.mode === 'active' ? detectMention(input, input.length) : null,
    [state.mode, input],
  );

  // Sync mentionOpen with the live derivation.
  useEffect(() => {
    if (mention && !state.mentionOpen) dispatch({ type: 'mention_open' });
    if (!mention && state.mentionOpen) dispatch({ type: 'mention_close' });
  }, [mention, state.mentionOpen]);

  // React to swarm appearing/changing on disk.
  useEffect(() => {
    if (state.mode !== 'active' && swarm.config) {
      dispatch({ type: 'swarm_detected', config: swarm.config });
    }
  }, [swarm.config, state.mode]);

  // React to roster changes (agent died, was renamed, etc.).
  useEffect(() => {
    if (state.mode === 'active') {
      dispatch({ type: 'agents_changed', agents: swarm.agents });
    }
  }, [swarm.agents, state.mode]);

  // ─── Wizard spawn ────────────────────────────────────────────────────────
  const handleWizardSpawn = () => {
    if (!state.rosterDraft || !state.pendingGoal) return;
    try {
      createSwarm({ goal: state.pendingGoal, workspaceRoot: cwd, agents: state.rosterDraft });
      // swarm.reload picks up the new swarm; the useEffect on swarm.config fires swarm_detected.
      swarm.reload();
    } catch (err: any) {
      dispatch({ type: 'push_output', line: `✗ ${err?.message ?? err}` });
    }
  };

  // ─── Keyboard ─────────────────────────────────────────────────────────────
  useInput((char, key) => {
    if (key.ctrl && char === 'c') { exit(); return; }

    const action = keyToAction(
      char,
      { tab: !!key.tab, escape: !!key.escape, return: !!key.return, upArrow: !!key.upArrow, downArrow: !!key.downArrow },
      input,
      state,
      swarm.agents,
    );
    if (action) {
      // Pre-dispatch: rename_start needs to seed the rename buffer with the current label.
      if (action.type === 'rename_start' && state.rosterDraft) {
        setRenameBuffer(state.rosterDraft[state.rosterCursor]?.label ?? '');
      }
      dispatch(action);
    }
    // Mention navigation
    if (state.mentionOpen) {
      const candidates = filterCandidates(mention?.token ?? '', swarm.agents);
      if (key.upArrow) dispatch({ type: 'mention_cursor_move', delta: -1, max: candidates.length - 1 });
      if (key.downArrow) dispatch({ type: 'mention_cursor_move', delta: 1, max: candidates.length - 1 });
      if (key.return && mention) {
        const pick = candidates[state.mentionCursor];
        if (pick) {
          const applied = applyMention(input, input.length, pick === '@all' ? 'all' : pick);
          setInput(applied.text);
        }
      }
    }
    // Wizard hotkeys outside Esc/arrows.
    if (state.mode === 'roster-wizard' && state.rosterRenaming === null) {
      if (key.upArrow) dispatch({ type: 'wizard_cursor_move', delta: -1 });
      if (key.downArrow) dispatch({ type: 'wizard_cursor_move', delta: 1 });
      if (char.toLowerCase() === 'r') {
        if (state.rosterDraft) setRenameBuffer(state.rosterDraft[state.rosterCursor]?.label ?? '');
        dispatch({ type: 'rename_start' });
      }
      if (key.return) handleWizardSpawn();
    }
  });

  // ─── Submit handler ──────────────────────────────────────────────────────
  const onSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput('');

    // Rename mode in wizard
    if (state.mode === 'roster-wizard' && state.rosterRenaming !== null) {
      dispatch({ type: 'rename_commit', newLabel: trimmed });
      setRenameBuffer('');
      return;
    }

    // No-swarm: typed text is the goal.
    if (state.mode === 'no-swarm') {
      dispatch({ type: 'goal_entered', text: trimmed });
      return;
    }

    // Slash command — delegate to the existing dispatcher.
    if (trimmed.startsWith('/')) {
      const result = await runCommand({
        line: trimmed,
        cwd,
        state: swarm,
        setFocusedAgent: () => { /* legacy — pruned in Unit 7 */ },
        setPendingGoal: () => { /* legacy */ },
        pushOutput: (line) => dispatch({ type: 'push_output', line }),
        reload: swarm.reload,
      });
      if (result) dispatch({ type: 'push_output', line: result });
      if (/^\/(stop|resume|approve|rename)\b/i.test(trimmed)) swarm.reload();
      if (trimmed === '/quit' || trimmed === '/exit') exit();
      return;
    }

    // Active mode: route the message.
    if (state.mode === 'active' && swarm.config) {
      const labels = swarm.config.agents.map((a) => a.label);
      const leading = parseLeadingMention(trimmed, labels);
      const paths = swarmPaths(swarm.config.workspaceRoot, swarm.config.id);
      try {
        if (leading) {
          sendMail({ paths, from: '@operator', to: leading.to, body: leading.body, type: 'message', knownAgents: swarm.config.agents });
          dispatch({ type: 'push_output', line: `→ ${leading.to}: ${leading.body}` });
        } else if (state.chatTarget) {
          sendMail({ paths, from: '@operator', to: state.chatTarget, body: trimmed, type: 'message', knownAgents: swarm.config.agents });
          dispatch({ type: 'push_output', line: `→ ${state.chatTarget}: ${trimmed}` });
        }
      } catch (err: any) {
        dispatch({ type: 'push_output', line: `✗ ${err?.message ?? err}` });
      }
    }
  };

  // ─── Layout ──────────────────────────────────────────────────────────────
  const headerHeight = 1;
  const inputHeight = 1;
  const activityHeight = 6;
  const popupExtra = state.mentionOpen ? 8 : 0;
  const slashExtra = input.startsWith('/') ? 8 : 0;
  const bodyHeight = Math.max(8, rows - headerHeight - inputHeight - activityHeight - popupExtra - slashExtra - 3);

  const sidebarActive = state.activePane === 'sidebar';
  const placeholder = state.mode === 'no-swarm'
    ? 'type a goal to start a swarm'
    : state.mode === 'roster-wizard' && state.rosterRenaming !== null
      ? 'new label · Enter to commit · Esc to cancel'
      : state.chatTarget
        ? `message to ${state.chatTarget}`
        : 'type / for commands';

  // While in rename mode, the input bar is repurposed as the rename buffer.
  const inRenameMode = state.mode === 'roster-wizard' && state.rosterRenaming !== null;
  const effectiveInput = inRenameMode ? renameBuffer : input;
  const onEffectiveChange = inRenameMode ? setRenameBuffer : setInput;

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Header swarm={swarm} rtkOn={rtkOn} />

      <Box flexDirection="row" height={bodyHeight}>
        <Box flexDirection="column" width={Math.min(34, Math.floor(cols * 0.34))} borderStyle="single" borderColor={sidebarActive ? 'cyan' : 'gray'} paddingX={1}>
          <AgentsPane
            agents={swarm.agents}
            focusedLabel={state.chatTarget}
            sidebarCursor={state.sidebarCursor}
            sidebarActive={sidebarActive}
          />
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
          {state.helpOverlay ? (
            <HelpOverlay />
          ) : state.mode === 'roster-wizard' && state.rosterDraft ? (
            <RosterWizard
              goal={state.pendingGoal ?? ''}
              draft={state.rosterDraft}
              cursor={state.rosterCursor}
              renamingIndex={state.rosterRenaming}
              renameBuffer={renameBuffer}
            />
          ) : state.mode === 'active' && state.rightPaneView === 'transcript' && state.chatTarget ? (
            <TranscriptPane cwd={cwd} swarmId={swarm.config?.id ?? null} agent={state.chatTarget} />
          ) : (
            <BoardPane tasks={swarm.tasks} output={state.output} />
          )}
        </Box>
      </Box>

      <Box flexDirection="column" height={activityHeight} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Activity</Text>
        <ActivityPane events={swarm.activity} max={activityHeight - 2} />
      </Box>

      <InputBar
        input={effectiveInput}
        cursor={effectiveInput.length}
        onChange={onEffectiveChange}
        onSubmit={onSubmit}
        placeholder={placeholder}
        mentionOpen={state.mentionOpen}
        mentionToken={mention?.token ?? ''}
        mentionCursor={state.mentionCursor}
        agents={swarm.agents}
        slashOpen={input.startsWith('/')}
      />
    </Box>
  );
};
