import pc from 'picocolors';
import { createSwarm } from '../lib/swarm.js';

export interface StartArgs {
  goal: string;
  workspace?: string;
  builders?: number;
  noReviewer?: boolean;
  noCoordinator?: boolean;
}

export function startCommand(args: StartArgs): void {
  const workspaceRoot = args.workspace ? args.workspace : process.cwd();
  const agents = composeRoster(args);

  console.log(pc.bold(pc.cyan('flock start')));
  console.log(`  workspace : ${workspaceRoot}`);
  console.log(`  goal      : ${args.goal}`);
  console.log(`  agents    : ${agents.map((a) => a.label).join(', ')}`);
  console.log();

  const { config, paths, pids } = createSwarm({
    goal: args.goal,
    workspaceRoot,
    agents,
  });

  console.log(pc.green(`✓ Swarm ${pc.bold(config.id)} created`));
  console.log(`  board     : ${paths.boardFile}`);
  console.log(`  spawned   :`);
  for (const [label, pid] of Object.entries(pids)) {
    console.log(`     • ${pc.cyan(label)} → pid ${pid}`);
  }
  console.log();
  console.log(pc.dim(`Next: ${pc.bold('flock status')} to watch progress, ${pc.bold('flock stop')} to tear down.`));
}

function composeRoster(args: StartArgs) {
  const list: { label: string; role: 'coordinator' | 'builder' | 'reviewer' }[] = [];
  if (!args.noCoordinator) list.push({ label: 'Coordinator 1', role: 'coordinator' });
  const builders = Math.max(1, args.builders ?? 2);
  for (let i = 1; i <= builders; i++) {
    list.push({ label: `Builder ${i}`, role: 'builder' });
  }
  if (!args.noReviewer) list.push({ label: 'Reviewer 1', role: 'reviewer' });
  return list;
}
