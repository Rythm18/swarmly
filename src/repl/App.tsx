/**
 * Top-level Ink TUI for swarmly.
 *
 * Layout:
 *   ┌─ Header (swarm id · agent count · rtk indicator) ─────────────┐
 *   │ Left pane (agents)         │ Right pane (board OR transcript)│
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ Activity feed (last N events)                                │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ > input line — slash commands or free text                   │
 *   └──────────────────────────────────────────────────────────────┘
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { useSwarmState } from './useSwarmState.js';
import { runCommand, COMMANDS } from './commands.js';
import { rtkAvailable } from './ambient.js';
import { Header } from './components/Header.js';
import { AgentsPane } from './components/AgentsPane.js';
import { BoardPane } from './components/BoardPane.js';
import { TranscriptPane } from './components/TranscriptPane.js';
import { ActivityPane } from './components/ActivityPane.js';

interface AppProps {
  cwd: string;
}

export const App: React.FC<AppProps> = ({ cwd }) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout?.columns ?? 100);
  const [rows, setRows] = useState(stdout?.rows ?? 30);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setCols(stdout.columns ?? 100);
      setRows(stdout.rows ?? 30);
    };
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  const swarm = useSwarmState(cwd);
  const rtkOn = useMemo(() => rtkAvailable(), []);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string[]>([
    '👋 Welcome to swarmly. Type / to see commands. Type a goal description to start a new swarm.',
  ]);
  const [focusedAgent, setFocusedAgent] = useState<string | null>(null);
  const [pendingGoal, setPendingGoal] = useState<string | null>(null);

  const pushOutput = (line: string) => setOutput((prev) => [...prev.slice(-100), line]);

  // ^C exits
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      exit();
    }
  });

  const onSubmit = async (value: string) => {
    if (!value.trim()) return;
    setInput('');
    pushOutput(`> ${value}`);

    // Pending goal confirmation flow
    if (pendingGoal !== null) {
      if (/^y(es)?$/i.test(value.trim())) {
        const result = await runCommand({
          line: `/start ${pendingGoal}`,
          cwd,
          state: swarm,
          setFocusedAgent,
          setPendingGoal: () => {},
          pushOutput,
          reload: swarm.reload,
        });
        setPendingGoal(null);
        if (result) pushOutput(result);
        // Reflect new on-disk state immediately so /status etc. work without the 2s poll wait.
        swarm.reload();
      } else if (/^n(o)?$/i.test(value.trim())) {
        pushOutput('Cancelled.');
        setPendingGoal(null);
      } else {
        pushOutput('Please answer y or n.');
      }
      return;
    }

    // Slash command vs free text
    if (value.startsWith('/')) {
      const result = await runCommand({
        line: value,
        cwd,
        state: swarm,
        setFocusedAgent,
        setPendingGoal,
        pushOutput,
        reload: swarm.reload,
      });
      if (result) pushOutput(result);
      // Refresh state immediately for commands that mutate the swarm
      const mutating = /^\/(start|stop|resume|approve|chat|mail)\b/i.test(value);
      if (mutating) swarm.reload();
      if (value.trim() === '/quit' || value.trim() === '/exit') exit();
    } else {
      // Free-text behavior depends on swarm state
      if (!swarm.config) {
        // No active swarm — treat as goal candidate
        setPendingGoal(value);
        pushOutput(`Start a new swarm with this goal? (y/n)`);
        pushOutput(`  "${value}"`);
      } else {
        pushOutput(`Use /chat <agent> to message an agent, or /mail <to> <body>. Type /help for commands.`);
      }
    }
  };

  // ─── Slash command suggestions ───
  // When input starts with /, surface matching commands above the input bar.
  // Tab autocompletes to the longest common prefix among matches.
  const slashMatches = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const q = input.toLowerCase();
    return COMMANDS.filter((c) => {
      // First token of the command spec, e.g. "/start" from "/start <goal>"
      const head = c.name.split(/\s+/)[0].toLowerCase();
      return head.startsWith(q);
    });
  }, [input]);

  // Tab key → autocomplete to the longest common prefix of matching commands
  useInput((_input, key) => {
    if (!key.tab) return;
    if (!input.startsWith('/') || slashMatches.length === 0) return;
    const firstTokens = slashMatches.map((c) => c.name.split(/\s+/)[0]);
    const prefix = longestCommonPrefix(firstTokens);
    if (prefix.length > input.length) setInput(prefix + ' ');
    else if (slashMatches.length === 1) setInput(firstTokens[0] + ' ');
  });

  // ─── Layout calculations ───
  const headerHeight = 1;
  const inputHeight = 1;
  const activityHeight = 6;
  const popupHeight = slashMatches.length > 0 ? Math.min(slashMatches.length + 2, 8) : 0;
  const bodyHeight = Math.max(8, rows - headerHeight - inputHeight - activityHeight - popupHeight - 3);

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <Header swarm={swarm} rtkOn={rtkOn} />

      <Box flexDirection="row" height={bodyHeight}>
        <Box flexDirection="column" width={Math.min(34, Math.floor(cols * 0.34))} borderStyle="single" borderColor="gray" paddingX={1}>
          <AgentsPane
            agents={swarm.agents}
            focusedLabel={focusedAgent}
            sidebarCursor={0}
            sidebarActive={false}
          />
        </Box>
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
          {focusedAgent ? (
            <TranscriptPane cwd={cwd} swarmId={swarm.config?.id ?? null} agent={focusedAgent} />
          ) : (
            <BoardPane tasks={swarm.tasks} output={output} />
          )}
        </Box>
      </Box>

      <Box flexDirection="column" height={activityHeight} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Activity</Text>
        <ActivityPane events={swarm.activity} max={activityHeight - 2} />
      </Box>

      {slashMatches.length > 0 && (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
          <Box>
            <Text dimColor>commands matching </Text>
            <Text color="cyan" bold>{input}</Text>
            <Text dimColor>  ·  Tab to complete  ·  Enter to run</Text>
          </Box>
          {slashMatches.slice(0, 6).map((c) => (
            <Box key={c.name}>
              <Text color="cyan">{c.name.split(/\s+/)[0]}</Text>
              <Text dimColor>{c.name.slice(c.name.split(/\s+/)[0].length)}</Text>
              <Text>  </Text>
              <Text dimColor>{c.help}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box flexDirection="row">
        <Text color="cyan" bold>{'> '}</Text>
        <TextInput value={input} onChange={setInput} onSubmit={onSubmit} placeholder={pendingGoal ? 'y / n' : 'type a goal or / for commands'} />
      </Box>
    </Box>
  );
};

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return '';
  let pref = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.startsWith(pref)) {
      pref = pref.slice(0, -1);
      if (!pref) return '';
    }
  }
  return pref;
}
