/**
 * Wire flock's status-tracking hook into Claude Code's settings.
 *
 * We add 3 hooks to <workspace>/.claude/settings.local.json:
 *   - UserPromptSubmit → record "working"
 *   - Stop             → record "idle"
 *   - Notification     → record "needs-input"
 *
 * The hooks command is gated on $FLOCK_AGENT_LABEL so they're a no-op for
 * any Claude Code session running in the same workspace that wasn't
 * spawned by flock (i.e., your normal terminal sessions).
 */

import fs from 'node:fs';
import path from 'node:path';
import { hookScriptPath } from './paths.js';

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: 'command'; command: string }>;
}

interface ClaudeSettings {
  hooks?: {
    UserPromptSubmit?: HookEntry[];
    Stop?: HookEntry[];
    Notification?: HookEntry[];
    [k: string]: HookEntry[] | undefined;
  };
  [k: string]: unknown;
}

const FLOCK_MARK = '#flock-managed';

export function installHooks(workspaceRoot: string): void {
  const settingsDir = path.join(workspaceRoot, '.claude');
  const settingsPath = path.join(settingsDir, 'settings.local.json');
  fs.mkdirSync(settingsDir, { recursive: true });

  const settings = readSettings(settingsPath);
  settings.hooks = settings.hooks ?? {};

  const script = hookScriptPath();
  // The shell wrapper checks the env var so non-flock Claude sessions skip.
  const wrap = (event: string) =>
    `test -n "$FLOCK_AGENT_LABEL" && node "${script}" ${event} ${FLOCK_MARK} || exit 0`;

  settings.hooks.UserPromptSubmit = upsert(
    settings.hooks.UserPromptSubmit,
    wrap('user-prompt-submit'),
  );
  settings.hooks.Stop = upsert(settings.hooks.Stop, wrap('stop'));
  settings.hooks.Notification = upsert(settings.hooks.Notification, wrap('notification'));

  writeSettings(settingsPath, settings);
}

export function uninstallHooks(workspaceRoot: string): void {
  const settingsPath = path.join(workspaceRoot, '.claude', 'settings.local.json');
  if (!fs.existsSync(settingsPath)) return;

  const settings = readSettings(settingsPath);
  if (!settings.hooks) return;

  for (const event of ['UserPromptSubmit', 'Stop', 'Notification'] as const) {
    const list = settings.hooks[event];
    if (!list) continue;
    const filtered = list
      .map((entry) => ({
        ...entry,
        hooks: entry.hooks.filter((h) => !h.command.includes(FLOCK_MARK)),
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (filtered.length === 0) {
      delete settings.hooks[event];
    } else {
      settings.hooks[event] = filtered;
    }
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  writeSettings(settingsPath, settings);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function readSettings(filepath: string): ClaudeSettings {
  if (!fs.existsSync(filepath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

function writeSettings(filepath: string, data: ClaudeSettings): void {
  // If hooks ended up empty AND nothing else is in the file, leave the file
  // empty rather than writing `{}` (cleaner).
  const content = Object.keys(data).length === 0 ? '' : JSON.stringify(data, null, 2);
  fs.writeFileSync(filepath, content);
}

/**
 * Add a hook command to the list if it isn't already there.
 * Idempotent — running installHooks() twice doesn't duplicate entries.
 */
function upsert(list: HookEntry[] | undefined, command: string): HookEntry[] {
  const existing = list ?? [];
  // Look for an entry with our managed marker
  const ours = existing.find((e) => e.hooks.some((h) => h.command.includes(FLOCK_MARK)));
  if (ours) {
    // Replace the flock command in-place to pick up any path changes
    ours.hooks = ours.hooks.map((h) =>
      h.command.includes(FLOCK_MARK) ? { type: 'command', command } : h,
    );
    return existing;
  }
  return [...existing, { matcher: '', hooks: [{ type: 'command', command }] }];
}
