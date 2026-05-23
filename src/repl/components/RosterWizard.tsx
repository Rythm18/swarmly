// src/repl/components/RosterWizard.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { AgentSpec } from '../../lib/types.js';

interface Props {
  goal: string;
  draft: AgentSpec[];
  cursor: number;
  renamingIndex: number | null;
  /** Live preview of the rename buffer — actual editing happens in the bottom InputBar. */
  renameBuffer: string;
}

export const RosterWizard: React.FC<Props> = (p) => {
  return (
    <Box flexDirection="column">
      <Text bold>Roster preview</Text>
      <Text dimColor>Goal: {p.goal}</Text>
      <Box height={1} />
      {p.draft.map((a, i) => {
        const isCursor = i === p.cursor;
        const isRenaming = p.renamingIndex === i;
        const marker = isCursor ? '▸' : ' ';
        const displayed = isRenaming ? p.renameBuffer || '_' : a.label;
        return (
          <Box key={i}>
            <Text color={isCursor ? 'cyan' : 'gray'}>{marker} </Text>
            <Text bold={isCursor} color={isRenaming ? 'cyan' : undefined}>{displayed}</Text>
            <Text dimColor>  {a.role}{isRenaming ? '  (editing — Enter commits, Esc cancels)' : ''}</Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text dimColor>↑↓ navigate · R rename · Enter spawn · Esc cancel</Text>
    </Box>
  );
};
