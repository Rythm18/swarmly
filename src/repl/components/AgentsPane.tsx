// src/repl/components/AgentsPane.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { AgentRuntime } from '../../lib/types.js';

interface Props {
  agents: AgentRuntime[];
  focusedLabel: string | null;
  sidebarCursor: number;
  sidebarActive: boolean;
}

export const AgentsPane: React.FC<Props> = ({ agents, focusedLabel, sidebarCursor, sidebarActive }) => {
  if (agents.length === 0) {
    return <Text dimColor>(no agents — type a goal to start a swarm)</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text bold>Agents</Text>
      {agents.map((a, i) => {
        const dot = statusGlyph(a.status);
        const time = a.lastSeen ? relativeTime(a.lastSeen) : '—';
        const isFocused = focusedLabel === a.label;
        const isCursor = sidebarActive && sidebarCursor === i;
        const marker = isCursor ? '▸' : isFocused ? '◀' : ' ';
        const numberPrefix = i < 9 ? `${i + 1} ` : '  ';
        return (
          <Box key={a.label}>
            <Text dimColor>{numberPrefix}</Text>
            <Text color={dot.color}>{dot.glyph}</Text>
            <Text> </Text>
            <Text bold={isFocused}>{a.label}</Text>
            <Text dimColor>  {a.role}  </Text>
            <Text dimColor>{time}</Text>
            <Text>  </Text>
            <Text color={isCursor ? 'cyan' : 'gray'}>{marker}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

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

function relativeTime(ms: number): string {
  const dt = Date.now() - ms;
  if (dt < 60_000) return `${Math.round(dt / 1000)}s`;
  if (dt < 3_600_000) return `${Math.round(dt / 60_000)}m`;
  return `${Math.round(dt / 3_600_000)}h`;
}
