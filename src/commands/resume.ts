import pc from 'picocolors';
import { resumeSwarm } from '../lib/swarm.js';

export interface ResumeArgs {
  workspace?: string;
  swarmId?: string;
}

export function resumeCommand(args: ResumeArgs): void {
  const workspaceRoot = args.workspace ? args.workspace : process.cwd();
  let result;
  try {
    result = resumeSwarm({ workspaceRoot, swarmId: args.swarmId });
  } catch (err: any) {
    console.error(pc.red(err?.message ?? String(err)));
    process.exit(1);
  }
  console.log(pc.bold(pc.cyan(`Resumed swarm ${result.config.id}`)));
  if (result.alreadyRunning.length > 0) {
    console.log(pc.dim('  still running : ') + result.alreadyRunning.join(', '));
  }
  if (result.respawned.length > 0) {
    console.log(pc.green('  respawned     : ') + result.respawned.join(', '));
  } else {
    console.log(pc.dim('  respawned     : (none — all agents alive)'));
  }
}
