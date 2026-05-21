/**
 * Entry point for the swarmly TUI. Renders <App/> using Ink.
 *
 * Called from cli.ts when `swarmly` is invoked with no subcommand.
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export function startRepl(cwd: string): void {
  render(React.createElement(App, { cwd }));
}
