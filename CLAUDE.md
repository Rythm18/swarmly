# swarmly

A small open-source CLI for orchestrating multi-agent [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) swarms. Filesystem-coordinated, Ink-based TUI, no GUI server, no subscription.

Published on npm as [`swarmly`](https://www.npmjs.com/package/swarmly). Repo: `Rythm18/swarmly`.

## Tech stack

- **TypeScript**, ESM, Node 18+
- **Ink** + React for the TUI
- **commander** for CLI parsing
- **vitest** for tests
- **picocolors** for terminal colors
- **nanoid** for swarm/message IDs

## Project layout

```
src/
├── cli.ts                  # commander entry; bare `swarmly` opens the TUI
├── hook.cjs                # raw JS — Claude Code status hook
├── commands/               # CLI subcommands (start, status, resume, stop, mail, hooks, attach)
├── lib/
│   ├── swarm.ts            # createSwarm/resumeSwarm/stopSwarm/getStatus
│   ├── spawn.ts            # spawn claude agents, pid mgmt
│   ├── mailbox.ts          # inbox/<agent>/*.json roundtrip
│   ├── board.ts            # SWARM_BOARD.md generation
│   ├── hooks.ts            # install/uninstall workspace .claude hooks
│   ├── paths.ts            # swarmPaths(), findActiveSwarm()
│   ├── types.ts            # shared types
│   └── __tests__/          # vitest unit tests
├── prompts/                # role prompt templates (coordinator/builder/reviewer .md)
└── repl/                   # Ink TUI (App.tsx, useSwarmState, commands, ambient)
```

State of a running swarm lives at `<workspace>/.swarm/<id>/`:
- `swarm.json` — config (id, goal, workspace, roster, createdAt)
- `SWARM_BOARD.md` — canonical task board (markdown)
- `agents.json` — roster
- `status/<agent>.json` — written by the hook on each event
- `inbox/<agent>/*.json` — filesystem mailbox
- `transcripts/<agent>.md` — per-agent turn-by-turn log
- `pids/<agent>.pid` — for resume / kill
- `logs/<agent>.log` — stdout+stderr from each Claude subprocess

## Workflows

### Branch + PR workflow (mandatory)

**Never push directly to `main`.** This repo has Claude-based PR review wired up — direct pushes bypass it.

For every change:
1. `git checkout -b v0.X.Y-short-name` (version-prefixed naming)
2. Commit + push the branch
3. Open a PR; let the review system weigh in before merging

Branch naming: `v0.X.Y-short-name`, e.g. `v0.3.3-slash-popup-and-tests`.

### Build / test / publish

```bash
npm test           # vitest run — 26 tests across mailbox/board/paths/hooks
npm test:watch     # interactive
npm run build      # tsc + copy prompts + copy hook.cjs + chmod +x bins
npm publish        # bumps require manual: package.json + cli.ts versions in lockstep
                   # then `npm publish` (will run tests + build via prepublishOnly)
```

After `npm publish`: tag the release in git (`git tag -a v0.X.Y -m "..."`) and push the tag.

### Multi-account GitHub note

This project's remote is `Rythm18/swarmly` (personal account). The `gh` CLI on this machine is typically logged in as `ridhamTo` (work account, for tarineryOne). Two ways to push:

- **HTTPS** (current `origin` URL) — uses osxkeychain credentials, which have Rythm18 cached. Just `git push` works.
- **SSH** (alternative) — `git@github.com-personal:Rythm18/swarmly.git` using the personal SSH key per `~/.ssh/config`.

If you need to open a PR via `gh pr create` as Rythm18, run `gh auth switch -u Rythm18` first.

## Design rules

- **Filesystem-only state.** No DB, no daemon, no MCP. You can `cat`, `grep`, `git diff` the entire swarm state.
- **Hooks are env-gated.** Our Claude Code status hook short-circuits unless `$SWARMLY_AGENT_LABEL` is set, so normal Claude Code sessions in the same workspace are untouched.
- **Tiny dependencies.** Adding a new dep needs a real justification — the whole tool is ~2k LOC.
- **MIT.** Anyone can fork, ship, or take pieces.

## Open follow-ups (as of v0.3.3)

- Homebrew tap (`Rythm18/homebrew-swarmly`) — scaffolded at `~/Desktop/homebrew-swarmly/`, formula has correct SHA for v0.3.1 but needs (a) new repo on GitHub, (b) SHA refresh for current latest, (c) push.
- GitHub Actions release pipeline — git tag → auto-publish to npm.
- Integration test that exercises start → status → stop with a mocked `claude` binary.
- v0.4 polish: keyboard-driven agent selection in the TUI left pane.
