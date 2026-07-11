#!/usr/bin/env node
import { runCli } from './main.js';
import { startWebServer, type RunningWebServer } from './web-server.js';

interface ProcessLifecycle {
  readonly addListener: (signal: NodeJS.Signals, listener: () => void) => void;
  readonly removeListener: (signal: NodeJS.Signals, listener: () => void) => void;
  setExitCode(code: number): void;
}

export async function runExecutable(
  argv: readonly string[],
  lifecycle: ProcessLifecycle = {
    addListener: (signal, listener) => process.once(signal, listener),
    removeListener: (signal, listener) => process.off(signal, listener),
    setExitCode: (code) => { process.exitCode = code; },
  },
): Promise<number> {
  let activeServer: RunningWebServer | undefined;
  const createSignalHandler = (exitCode: number) => () => {
    void activeServer?.close().finally(() => lifecycle.setExitCode(exitCode));
  };
  const onSigint = createSignalHandler(130);
  const onSigterm = createSignalHandler(143);
  lifecycle.addListener('SIGINT', onSigint);
  lifecycle.addListener('SIGTERM', onSigterm);
  try {
    return await runCli(argv, {
      stdout: (text) => process.stdout.write(text),
      stderr: (text) => process.stderr.write(text),
      cwd: process.cwd(),
    }, {
      startWebServer: async (options) => {
        const server = await startWebServer(options);
        activeServer = server;
        return server;
      },
    });
  } finally {
    lifecycle.removeListener('SIGINT', onSigint);
    lifecycle.removeListener('SIGTERM', onSigterm);
  }
}

process.exitCode = await runExecutable(process.argv.slice(2));
