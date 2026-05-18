# flock

> Orchestrate multi-agent [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) swarms from your terminal. Open source. Filesystem-coordinated. No GUI required. No subscription.

A small, hackable CLI for running coordinated Claude Code agents on a single goal. One agent decomposes the work (the **Coordinator**), several do the implementation (**Builders**), and one reviews the output (the **Reviewer**). Everything coordinates through plain files in `<workspace>/.swarm/`, so you can `cat`, `grep`, and `git diff` the entire swarm state.

## Why

If you've used commercial multi-agent orchestrators, you know:

- They install background daemons that don't quit when you ⌘Q the app.
- They wire hooks into your `.claude/settings.local.json` that fire for **every** Claude Code session, including the ones running outside their tool.
- You pay a subscription for what's ultimately a few hundred lines of file-shuffling logic on top of `claude --dangerously-skip-permissions`.

flock is the minimum useful version of that — without any of the above.

## Install

```bash
npm install -g flock
```

Or run from source:

```bash
git clone https://github.com/ridhamk/flock.git
cd flock
npm install
npm run build
npm link
```

You need [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) installed and `claude` on your `$PATH`.

## Quick start

```bash
cd ~/projects/my-app
flock start "Build a markdown-to-PDF export feature. Should preserve code blocks and tables."
flock status --watch
```

That's the whole MVP. By default this spawns:

- 1 × Coordinator (decomposes the goal, assigns tasks)
- 2 × Builders (implement assigned tasks)
- 1 × Reviewer (reviews the final output)

Each agent is a `claude --dangerously-skip-permissions` process running in `<workspace>/`. They coordinate through markdown and JSON files in `<workspace>/.swarm/<id>/`.

## Commands

```
flock start "<goal>"          # bootstrap a new swarm
flock status [--watch]        # live dashboard
flock resume                  # respawn any dead agents
flock stop                    # kill agents, uninstall hooks
flock mail send|check|agents  # inter-agent messaging
flock hooks install|uninstall # manage Claude Code status hooks
```

Run `flock <cmd> --help` for full options.

## How it works

```
<workspace>/.swarm/<id>/
├── swarm.json              # config: id, goal, workspace, agent roster
├── SWARM_BOARD.md          # canonical task board (markdown)
├── agents.json             # agent roster (label, role)
├── status/<agent>.json     # written by hook on each Claude event
├── inbox/<agent>/*.json    # filesystem mailbox
├── pids/<agent>.pid        # for resume / kill
└── logs/<agent>.log        # stdout+stderr from each agent's Claude process
```

### Coordination is filesystem-only

No MCP server. No daemon. No network. Agents read the board, write status, drop messages in each other's inboxes. You can `git diff` the swarm state to see what changed.

### Hooks are gated on `$FLOCK_AGENT_LABEL`

When you run `flock hooks install`, three Claude Code hooks (`UserPromptSubmit`, `Stop`, `Notification`) get added to your workspace's `.claude/settings.local.json`. **Each command is gated** on `$FLOCK_AGENT_LABEL` being set — which only flock-spawned agents have. Your regular Claude Code terminal sessions in the same workspace are untouched.

```bash
# What ends up in .claude/settings.local.json (simplified):
test -n "$FLOCK_AGENT_LABEL" && node "<path>/hook.cjs" stop || exit 0
```

### Resume after crash / reboot

```bash
flock resume
```

Walks the pidfiles, kills entries pointing at dead processes, respawns the missing agents with a "you were interrupted, re-read the board, continue" prompt. The on-disk state (board, completed work, mailboxes) is preserved.

### Customizing role prompts

The default prompts live in the npm package at `dist/prompts/{coordinator,builder,reviewer}.md`. Override them by dropping your own at:

```
~/.config/flock/roles/coordinator.md
~/.config/flock/roles/builder.md
~/.config/flock/roles/reviewer.md
```

Available template variables: `{{label}}`, `{{role}}`, `{{goal}}`, `{{swarm_id}}`, `{{board_path}}`, `{{workspace_root}}`, `{{agent_roster}}`.

## Architecture decisions

| Decision | Why |
|---|---|
| Filesystem-only state | `cat`/`grep`/`git diff` work as debugging tools. No DB to corrupt. |
| One `claude` process per agent | Strong isolation. PIDs are easy to manage. |
| `--dangerously-skip-permissions` | Agents need to act autonomously. They run in your workspace, not as you. Use at your own discretion. |
| Markdown task board | Human-readable, agent-editable, version-controllable. |
| MIT license | Take it, fork it, ship it. Just don't sue me. |

## Roadmap

v0.2:
- TUI dashboard (replace the plain table)
- Custom role definitions in `swarm.yaml`
- Multi-swarm-per-workspace
- `flock mail listen` for streaming output

v0.3:
- Optional web UI (drop a tiny `python -m http.server` static page that polls status JSONs)
- Plugin hooks for git, CI, Slack

## Contributing

Issues and PRs welcome. The code is small (~1k LOC) and intentionally readable — start with `src/lib/swarm.ts`.

## License

[MIT](./LICENSE) © Ridham Khandar
