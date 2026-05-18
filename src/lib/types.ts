/**
 * Core types for swarmly — a multi-agent Claude Code swarm orchestrator.
 *
 * The whole tool is filesystem-coordinated: every type here corresponds to
 * something that lives on disk under <workspace>/.swarm/<id>/.
 */

export type AgentRole = 'coordinator' | 'builder' | 'reviewer';

export type AgentStatus =
  | 'spawning'    // process started, agent not yet responsive
  | 'idle'        // waiting for work / finished current task
  | 'working'     // actively processing
  | 'needs-input' // blocked, asked the operator a question
  | 'done'        // task complete, no more work expected
  | 'dead';       // process exited / was killed

export interface AgentSpec {
  /** Display label, e.g. "Builder 1" */
  label: string;
  /** Role determines which prompt template is used */
  role: AgentRole;
}

export interface AgentRuntime extends AgentSpec {
  /** PID of the spawned claude process; undefined if not yet spawned or dead */
  pid?: number;
  /** Last-known status from the hook events */
  status: AgentStatus;
  /** Timestamp (ms) of the last status update */
  lastSeen?: number;
  /** Optional human-readable detail line on the last status */
  detail?: string;
}

export interface SwarmConfig {
  /** Short unique identifier for the swarm */
  id: string;
  /** The goal text the operator provided when starting the swarm */
  goal: string;
  /** Absolute path of the workspace root the swarm is anchored to */
  workspaceRoot: string;
  /** Roster of agents in this swarm */
  agents: AgentSpec[];
  /** ISO timestamp when the swarm was created */
  createdAt: string;
}

export interface MailMessage {
  /** Unique message id */
  id: string;
  /** Sender label, "@operator", or "@system" */
  from: string;
  /** Recipient label, "@all", or "@operator" */
  to: string;
  /** Free-form classification: message, status, escalation, worker_done */
  type: 'message' | 'status' | 'escalation' | 'worker_done';
  /** Message body (markdown allowed) */
  body: string;
  /** ISO timestamp */
  timestamp: string;
}

export interface SwarmPaths {
  /** <workspace>/.swarm */
  baseDir: string;
  /** <workspace>/.swarm/<id>/ */
  swarmDir: string;
  /** <workspace>/.swarm/<id>/swarm.json */
  configFile: string;
  /** <workspace>/.swarm/<id>/SWARM_BOARD.md */
  boardFile: string;
  /** <workspace>/.swarm/<id>/agents.json */
  agentsFile: string;
  /** <workspace>/.swarm/<id>/status/ */
  statusDir: string;
  /** <workspace>/.swarm/<id>/inbox/ */
  inboxDir: string;
  /** <workspace>/.swarm/<id>/pids/ */
  pidsDir: string;
  /** <workspace>/.swarm/<id>/logs/ */
  logsDir: string;
}
