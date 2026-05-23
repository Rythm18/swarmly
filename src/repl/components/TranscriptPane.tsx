// src/repl/components/TranscriptPane.tsx
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

export const TranscriptPane: React.FC<{ cwd: string; swarmId: string | null; agent: string }> = ({ cwd, swarmId, agent }) => {
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
      <Text dimColor>(press Esc to swap to board view)</Text>
      <Text>{content}</Text>
    </Box>
  );
};
