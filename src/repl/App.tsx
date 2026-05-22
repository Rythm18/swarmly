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
import { useSwarmState, type ActivityEvent } from './useSwarmState.js';
import { runCommand, COMMANDS } from './commands.js';
import { rtkAvailable } from './ambient.js';
import type { AgentRuntime } from '../lib/types.js';

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
      return head.startsWith(q) || c.name.toLowerCase().includes(q.replace('/', ''));
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
      <Header swarm={swarm} rtkOn={rtkOn} width={cols} />

      <Box flexDirection="row" height={bodyHeight}>
        <Box flexDirection="column" width={Math.min(34, Math.floor(cols * 0.34))} borderStyle="single" borderColor="gray" paddingX={1}>
          <AgentsPane agents={swarm.agents} focused={focusedAgent} />
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

// ─── Header ────────────────────────────────────────────────────────────────

const Header: React.FC<{ swarm: ReturnType<typeof useSwarmState>; rtkOn: boolean; width: number }> = ({ swarm, rtkOn }) => {
  const id = swarm.config?.id ?? '(no active swarm)';
  const counts = swarm.agents.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || '—';
  return (
    <Box>
      <Text bold color="cyan">swarmly</Text>
      <Text>  </Text>
      <Text color="gray">{id}</Text>
      <Text>  </Text>
      <Text color="gray">·</Text>
      <Text>  </Text>
      <Text>{summary}</Text>
      <Text>  </Text>
      <Text color="gray">·</Text>
      <Text>  </Text>
      <Text color={rtkOn ? 'green' : 'gray'}>rtk {rtkOn ? '✓' : '—'}</Text>
    </Box>
  );
};

// ─── Agents pane ───────────────────────────────────────────────────────────

const AgentsPane: React.FC<{ agents: AgentRuntime[]; focused: string | null }> = ({ agents, focused }) => {
  if (agents.length === 0) {
    return <Text dimColor>(no agents — /start a swarm to begin)</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text bold>Agents</Text>
      {agents.map((a) => {
        const isFocused = focused === a.label;
        const dot = statusGlyph(a.status);
        const time = a.lastSeen ? relativeTime(a.lastSeen) : '—';
        return (
          <Box key={a.label}>
            <Text color={dot.color}>{dot.glyph}</Text>
            <Text> </Text>
            <Text bold={isFocused}>{a.label}</Text>
            <Text dimColor>  {a.role}  </Text>
            <Text dimColor>{time}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

// ─── Board pane (default right) ────────────────────────────────────────────

const BoardPane: React.FC<{ tasks: ReturnType<typeof useSwarmState>['tasks']; output: string[] }> = ({ tasks, output }) => {
  return (
    <Box flexDirection="column">
      <Text bold>Board</Text>
      {tasks.length === 0 ? (
        <Text dimColor>(no tasks yet)</Text>
      ) : (
        tasks.map((t) => (
          <Box key={t.num}>
            <Text dimColor>T{t.num}</Text>
            <Text>  </Text>
            <Text>{t.title}</Text>
            <Text dimColor>  →  </Text>
            <Text color={statusToColor(t.status)}>{t.status}</Text>
          </Box>
        ))
      )}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Output</Text>
        {output.slice(-8).map((line, i) => (
          <Text key={i} wrap="truncate">{line}</Text>
        ))}
      </Box>
    </Box>
  );
};

// ─── Transcript pane (when an agent is focused) ────────────────────────────

const TranscriptPane: React.FC<{ cwd: string; swarmId: string | null; agent: string }> = ({ cwd, swarmId, agent }) => {
  const [content, setContent] = useState<string>('');
  useEffect(() => {
    if (!swarmId) { setContent(''); return; }
    const fp = `${cwd}/.swarm/${swarmId}/transcripts/${agent}.md`;
    const read = () => {
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        if (fs.existsSync(fp)) setContent(fs.readFileSync(fp, 'utf8'));
        else setContent('(no transcript yet)');
      } catch { setContent('(error reading transcript)'); }
    };
    read();
    const id = setInterval(read, 2000);
    return () => { clearInterval(id); };
  }, [cwd, swarmId, agent]);
  return (
    <Box flexDirection="column">
      <Text bold>{agent}'s transcript</Text>
      <Text dimColor>(use /board to return to board view)</Text>
      <Text>{content}</Text>
    </Box>
  );
};

// ─── Activity pane ─────────────────────────────────────────────────────────

const ActivityPane: React.FC<{ events: ActivityEvent[]; max: number }> = ({ events, max }) => {
  if (events.length === 0) {
    return <Text dimColor>(no events yet)</Text>;
  }
  return (
    <Box flexDirection="column">
      {events.slice(0, max).map((e) => (
        <Box key={e.id}>
          <Text color={kindColor(e.kind)}>[{e.kind}]</Text>
          <Text> </Text>
          <Text wrap="truncate">{e.text}</Text>
          <Text dimColor>  {relativeTime(e.timestamp)}</Text>
        </Box>
      ))}
    </Box>
  );
};

// ─── helpers ───────────────────────────────────────────────────────────────

function statusGlyph(s: AgentRuntime['status']): { glyph: string; color: string } {
  switch (s) {
    case 'working': return { glyph: '●', color: 'green' };
    case 'idle': return { glyph: '○', color: 'blue' };
    case 'needs-input': return { glyph: '◐', color: 'yellow' };
    case 'dead': return { glyph: '✗', color: 'red' };
    case 'spawning': return { glyph: '◌', color: 'gray' };
    default: return { glyph: '○', color: 'gray' };
  }
}

function statusToColor(s: string): string {
  const v = s.toUpperCase();
  if (v.includes('DONE')) return 'green';
  if (v.includes('BUILDING') || v.includes('PLANNING')) return 'yellow';
  if (v.includes('BLOCKED')) return 'red';
  if (v.includes('ASSIGNED')) return 'cyan';
  if (v.includes('PROPOSED')) return 'magenta';
  return 'gray';
}

function kindColor(k: ActivityEvent['kind']): string {
  switch (k) {
    case 'mail': return 'cyan';
    case 'status': return 'green';
    case 'board': return 'yellow';
    case 'task': return 'magenta';
    default: return 'gray';
  }
}

function relativeTime(ms: number): string {
  const dt = Date.now() - ms;
  if (dt < 60_000) return `${Math.round(dt / 1000)}s`;
  if (dt < 3_600_000) return `${Math.round(dt / 60_000)}m`;
  return `${Math.round(dt / 3_600_000)}h`;
}
