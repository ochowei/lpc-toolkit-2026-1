#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runCli } from './main.js';
import { startWebServer, type RunningWebServer } from './web-server.js';

export interface ProcessLifecycle {
  readonly addListener: (signal: NodeJS.Signals, listener: () => void) => void;
  readonly removeListener: (signal: NodeJS.Signals, listener: () => void) => void;
  setExitCode(code: number): void;
}

export interface ExecutableDependencies {
  readonly runCli: typeof runCli;
  readonly startWebServer: typeof startWebServer;
}

const DEFAULT_DEPENDENCIES: ExecutableDependencies = { runCli, startWebServer };

export async function runExecutable(
  argv: readonly string[],
  lifecycle: ProcessLifecycle = {
    addListener: (signal, listener) => process.once(signal, listener),
    removeListener: (signal, listener) => process.off(signal, listener),
    setExitCode: (code) => { process.exitCode = code; },
  },
  dependencies: ExecutableDependencies = DEFAULT_DEPENDENCIES,
): Promise<number> {
  let activeServer: RunningWebServer | undefined;
  let shutdownExitCode: number | undefined;
  let closing: Promise<void> | undefined;
  const closeActiveServer = (): Promise<void> | undefined => {
    if (activeServer !== undefined && closing === undefined) closing = activeServer.close();
    return closing;
  };
  const createSignalHandler = (exitCode: number) => () => {
    shutdownExitCode ??= exitCode;
    lifecycle.setExitCode(shutdownExitCode);
    void closeActiveServer()?.catch(() => undefined);
  };
  const onSigint = createSignalHandler(130);
  const onSigterm = createSignalHandler(143);
  lifecycle.addListener('SIGINT', onSigint);
  lifecycle.addListener('SIGTERM', onSigterm);
  try {
    const result = await dependencies.runCli(argv, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      cwd: process.cwd(),
    }, {
      startWebServer: async (options) => {
        const server = await dependencies.startWebServer(options);
        activeServer = server;
        if (shutdownExitCode !== undefined) await closeActiveServer();
        return server;
      },
    });
    return shutdownExitCode ?? result;
  } finally {
    lifecycle.removeListener('SIGINT', onSigint);
    lifecycle.removeListener('SIGTERM', onSigterm);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runExecutable(process.argv.slice(2));
}
