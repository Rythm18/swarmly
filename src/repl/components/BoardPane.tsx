// src/repl/components/BoardPane.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { useSwarmState } from '../useSwarmState.js';

export const BoardPane: React.FC<{ tasks: ReturnType<typeof useSwarmState>['tasks']; output: string[] }> = ({ tasks, output }) => {
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

function statusToColor(s: string): string {
  const v = s.toUpperCase();
  if (v.includes('DONE')) return 'green';
  if (v.includes('BUILDING') || v.includes('PLANNING')) return 'yellow';
  if (v.includes('BLOCKED')) return 'red';
  if (v.includes('ASSIGNED')) return 'cyan';
  if (v.includes('PROPOSED')) return 'magenta';
  return 'gray';
}
