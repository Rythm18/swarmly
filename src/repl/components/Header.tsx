// src/repl/components/Header.tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { useSwarmState } from '../useSwarmState.js';

export const Header: React.FC<{ swarm: ReturnType<typeof useSwarmState>; rtkOn: boolean }> = ({ swarm, rtkOn }) => {
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
