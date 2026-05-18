import pc from 'picocolors';
import { stopSwarm } from '../lib/swarm.js';

export interface StopArgs {
  workspace?: string;
  swarmId?: string;
  keepHooks?: boolean;
}

export function stopCommand(args: StopArgs): void {
  const workspaceRoot = args.workspace ? args.workspace : process.cwd();
  let result;
  try {
    result = stopSwarm({
      workspaceRoot,
      swarmId: args.swarmId,
      keepHooks: args.keepHooks,
    });
  } catch (err: any) {
    console.error(pc.red(err?.message ?? String(err)));
    process.exit(1);
  }
  console.log(pc.bold(pc.cyan(`Stopped swarm ${result.config.id}`)));
  if (result.killed.length === 0) {
    console.log(pc.dim('  killed : (none — agents were already dead)'));
  } else {
    console.log(pc.green('  killed : ') + result.killed.join(', '));
  }
  console.log(pc.dim(`  hooks  : ${args.keepHooks ? 'left in place' : 'uninstalled'}`));
  console.log(pc.dim(`Board preserved at .swarm/${result.config.id}/SWARM_BOARD.md`));
}
