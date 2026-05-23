// src/repl/components/InputBar.tsx
import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { AgentRuntime } from '../../lib/types.js';
import { MentionPicker } from './MentionPicker.js';
import { COMMANDS } from '../commands.js';

interface Props {
  input: string;
  cursor: number;
  onChange: (s: string) => void;
  onSubmit: (s: string) => void;
  placeholder: string;
  mentionOpen: boolean;
  mentionToken: string;
  mentionCursor: number;
  agents: AgentRuntime[];
  slashOpen: boolean;
}

export const InputBar: React.FC<Props> = (p) => {
  return (
    <Box flexDirection="column">
      {p.slashOpen && (
        <SlashPopup input={p.input} />
      )}
      {p.mentionOpen && (
        <MentionPicker token={p.mentionToken} agents={p.agents} cursor={p.mentionCursor} />
      )}
      <Box>
        <Text color="cyan" bold>{'> '}</Text>
        <TextInput value={p.input} onChange={p.onChange} onSubmit={p.onSubmit} placeholder={p.placeholder} />
      </Box>
    </Box>
  );
};

const SlashPopup: React.FC<{ input: string }> = ({ input }) => {
  const q = input.toLowerCase();
  const matches = COMMANDS.filter((c) => c.name.split(/\s+/)[0].toLowerCase().startsWith(q));
  if (matches.length === 0) return null;
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1}>
      <Box>
        <Text dimColor>commands matching </Text>
        <Text color="cyan" bold>{input}</Text>
        <Text dimColor>  ·  Tab to complete  ·  Enter to run</Text>
      </Box>
      {matches.slice(0, 6).map((c) => (
        <Box key={c.name}>
          <Text color="cyan">{c.name.split(/\s+/)[0]}</Text>
          <Text dimColor>{c.name.slice(c.name.split(/\s+/)[0].length)}</Text>
          <Text>  </Text>
          <Text dimColor>{c.help}</Text>
        </Box>
      ))}
    </Box>
  );
};
