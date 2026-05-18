import pc from 'picocolors';
import { installHooks, uninstallHooks } from '../lib/hooks.js';

export interface HookArgs {
  workspace?: string;
}

export function hooksInstallCommand(args: HookArgs): void {
  const root = args.workspace ? args.workspace : process.cwd();
  installHooks(root);
  console.log(pc.green('✓ hooks installed'));
  console.log(pc.dim(`  ${root}/.claude/settings.local.json`));
  console.log(pc.dim('  hooks are gated on $SWARMLY_AGENT_LABEL — non-swarmly sessions are unaffected.'));
}

export function hooksUninstallCommand(args: HookArgs): void {
  const root = args.workspace ? args.workspace : process.cwd();
  uninstallHooks(root);
  console.log(pc.green('✓ hooks removed'));
  console.log(pc.dim(`  ${root}/.claude/settings.local.json cleaned up.`));
}
