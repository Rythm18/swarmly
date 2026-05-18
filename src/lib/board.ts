/**
 * SWARM_BOARD.md generation.
 *
 * The board is the canonical source of truth for what the swarm is doing.
 * Agents read it on every turn; the Coordinator owns updates to the Task
 * Breakdown table; each agent owns its own section under "Agent Sections".
 */

import type { SwarmConfig, AgentSpec } from './types.js';

export function generateBoard(swarm: SwarmConfig): string {
  return `# Swarm Board — ${swarm.id}

> Owned by: **Coordinator 1** · Created: ${swarm.createdAt}
> Workspace: \`${swarm.workspaceRoot}\`

## Goal

${swarm.goal}

## Task Breakdown

| # | Task | Owner | Status | Notes |
|---|------|-------|--------|-------|
| _Coordinator will populate this table after decomposing the goal._ | | | | |

## Agent Sections

${swarm.agents.map((a) => agentSection(a)).join('\n\n')}

## Completed Work Log

_Empty. Builders append entries here as tasks complete._

## Operator Notes

_Operator can write directives here for the swarm to read on next poll._
`;
}

function agentSection(agent: AgentSpec): string {
  return `### ${agent.label} (${agent.role})

- **Status:** WAITING
- **Owned files:** _(populated when task is assigned)_
- **Approach:** _(filled in PLANNING)_
- **Notes:** _(any blockers / decisions)_`;
}

/**
 * Append a line to the Completed Work Log section.
 * Lightweight string manipulation — agents do the heavier writes themselves.
 */
export function appendCompletionEntry(boardMd: string, line: string): string {
  const marker = '## Completed Work Log';
  const idx = boardMd.indexOf(marker);
  if (idx === -1) {
    // Marker missing — append at end.
    return boardMd + `\n${marker}\n\n- ${line}\n`;
  }
  // Insert right after the marker line and any blank line.
  const before = boardMd.slice(0, idx + marker.length);
  const after = boardMd.slice(idx + marker.length);
  return `${before}\n\n- ${line}${after}`;
}
