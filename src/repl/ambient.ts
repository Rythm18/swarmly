/**
 * Ambient signal probes — small "is X available on the host" checks the TUI
 * uses for its status bar (rtk indicator, claude binary present, etc.).
 */

import { spawnSync } from 'node:child_process';

let rtkCache: boolean | null = null;

export function rtkAvailable(): boolean {
  if (rtkCache !== null) return rtkCache;
  try {
    const r = spawnSync('rtk', ['--version'], { stdio: 'ignore', timeout: 1500 });
    rtkCache = r.status === 0;
  } catch {
    rtkCache = false;
  }
  return rtkCache;
}

export function claudeAvailable(): boolean {
  try {
    const r = spawnSync('claude', ['--version'], { stdio: 'ignore', timeout: 1500 });
    return r.status === 0;
  } catch {
    return false;
  }
}
