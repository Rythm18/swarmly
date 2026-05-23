// src/repl/components/MentionPicker.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { AgentRuntime } from '../../lib/types.js';

interface Props {
  token: string;
  agents: AgentRuntime[];
  cursor: number;
}

/** Matches @all + agent labels whose label includes `token` (case-insensitive). */
export function filterCandidates(token: string, agents: AgentRuntime[]): string[] {
  const q = token.toLowerCase();
  const all: string[] = ['@all', ...agents.map((a) => a.label)];
  return all.filter((s) => s.toLowerCase().includes(q));
}

export const MentionPicker: React.FC<Props> = ({ token, agents, cursor }) => {
  const candidates = filterCandidates(token, agents);
  if (candidates.length === 0) {
    return (
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text dimColor>no matches for @{token}</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text dimColor>mention @{token}  ·  ↑↓ select  ·  Enter insert  ·  Esc cancel</Text>
      {candidates.slice(0, 6).map((label, i) => (
        <Box key={label}>
          <Text color={i === cursor ? 'cyan' : 'gray'}>{i === cursor ? '▸ ' : '  '}</Text>
          <Text bold={i === cursor}>{label}</Text>
        </Box>
      ))}
    </Box>
  );
};
