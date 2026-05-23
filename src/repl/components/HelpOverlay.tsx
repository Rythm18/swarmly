// src/repl/components/HelpOverlay.tsx
import React from 'react';
import { Box, Text } from 'ink';

const ROWS: Array<[string, string]> = [
  ['1–9', 'Focus agent by index'],
  ['Tab', 'Toggle pane (input ↔ sidebar)'],
  ['↑/↓', 'Move sidebar cursor (when sidebar focused)'],
  ['Enter', 'Sidebar: commit cursor · Input: send message'],
  ['Esc', 'Toggle right pane (transcript ↔ board)'],
  ['@', 'Open mention picker'],
  ['/', 'Open slash command popup'],
  ['?', 'Toggle this overlay'],
  ['Ctrl+C', 'Exit'],
];

export const HelpOverlay: React.FC = () => (
  <Box flexDirection="column" borderStyle="double" borderColor="cyan" paddingX={1}>
    <Text bold color="cyan">Keyboard shortcuts</Text>
    <Box height={1} />
    {ROWS.map(([k, d]) => (
      <Box key={k}>
        <Text color="cyan">{k.padEnd(8)}</Text>
        <Text>{d}</Text>
      </Box>
    ))}
    <Box height={1} />
    <Text dimColor>(press ? or Esc to close)</Text>
  </Box>
);
