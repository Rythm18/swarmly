import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installHooks, uninstallHooks } from '../hooks.js';

let tmpDir: string;
const settingsPath = (root: string) => path.join(root, '.claude', 'settings.local.json');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmly-hooks-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('hooks.installHooks', () => {
  it('creates .claude/settings.local.json with all three event hooks', () => {
    installHooks(tmpDir);
    expect(fs.existsSync(settingsPath(tmpDir))).toBe(true);
    const cfg = JSON.parse(fs.readFileSync(settingsPath(tmpDir), 'utf8'));
    expect(cfg.hooks.UserPromptSubmit).toBeDefined();
    expect(cfg.hooks.Stop).toBeDefined();
    expect(cfg.hooks.Notification).toBeDefined();
  });

  it('gates every hook command on $SWARMLY_AGENT_LABEL', () => {
    installHooks(tmpDir);
    const cfg = JSON.parse(fs.readFileSync(settingsPath(tmpDir), 'utf8'));
    for (const event of ['UserPromptSubmit', 'Stop', 'Notification']) {
      const cmd = cfg.hooks[event][0].hooks[0].command;
      expect(cmd).toContain('SWARMLY_AGENT_LABEL');
      expect(cmd).toContain('swarmly-managed');
    }
  });

  it('is idempotent — installing twice does not duplicate entries', () => {
    installHooks(tmpDir);
    installHooks(tmpDir);
    const cfg = JSON.parse(fs.readFileSync(settingsPath(tmpDir), 'utf8'));
    expect(cfg.hooks.UserPromptSubmit).toHaveLength(1);
    expect(cfg.hooks.Stop).toHaveLength(1);
    expect(cfg.hooks.Notification).toHaveLength(1);
  });

  it('preserves unrelated keys when modifying an existing settings file', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(settingsPath(tmpDir), JSON.stringify({
      permissions: { allow: ['Bash(ls:*)'] },
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo unrelated' }] }],
      },
    }));
    installHooks(tmpDir);
    const cfg = JSON.parse(fs.readFileSync(settingsPath(tmpDir), 'utf8'));
    // Unrelated permissions block untouched
    expect(cfg.permissions.allow).toEqual(['Bash(ls:*)']);
    // The pre-existing hook is still there alongside ours
    expect(cfg.hooks.UserPromptSubmit.length).toBe(2);
  });
});

describe('hooks.uninstallHooks', () => {
  it('removes only the flock/swarmly-managed entries, leaves others intact', () => {
    fs.mkdirSync(path.join(tmpDir, '.claude'));
    fs.writeFileSync(settingsPath(tmpDir), JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo unrelated' }] }],
      },
    }));
    installHooks(tmpDir);
    uninstallHooks(tmpDir);
    const cfg = JSON.parse(fs.readFileSync(settingsPath(tmpDir), 'utf8'));
    // Unrelated hook survives
    expect(cfg.hooks.UserPromptSubmit).toHaveLength(1);
    expect(cfg.hooks.UserPromptSubmit[0].hooks[0].command).toContain('unrelated');
    // Our Stop + Notification hooks are gone
    expect(cfg.hooks.Stop).toBeUndefined();
    expect(cfg.hooks.Notification).toBeUndefined();
  });

  it('does nothing gracefully when settings file does not exist', () => {
    expect(() => uninstallHooks(tmpDir)).not.toThrow();
    expect(fs.existsSync(settingsPath(tmpDir))).toBe(false);
  });

  it('writes empty file (not "{}") when uninstalling leaves no other keys', () => {
    installHooks(tmpDir);
    uninstallHooks(tmpDir);
    expect(fs.existsSync(settingsPath(tmpDir))).toBe(true);
    const content = fs.readFileSync(settingsPath(tmpDir), 'utf8');
    expect(content).toBe('');
  });
});
