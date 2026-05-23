// src/repl/components/ActivityPane.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ActivityEvent } from '../useSwarmState.js';

export const ActivityPane: React.FC<{ events: ActivityEvent[]; max: number }> = ({ events, max }) => {
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
