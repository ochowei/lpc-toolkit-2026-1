import { describe, expect, it, vi } from 'vitest';
import { runExecutable } from '../src/index.js';
import type { RunningWebServer } from '../src/web-server.js';

type SignalHandler = () => void;

function createLifecycle(): {
  readonly listeners: Map<NodeJS.Signals, SignalHandler>;
  readonly exitCodes: number[];
  readonly lifecycle: {
    readonly addListener: (signal: NodeJS.Signals, listener: SignalHandler) => void;
    readonly removeListener: (signal: NodeJS.Signals, listener: SignalHandler) => void;
    readonly setExitCode: (code: number) => void;
  };
} {
  const listeners = new Map<NodeJS.Signals, SignalHandler>();
  const exitCodes: number[] = [];
  return {
    listeners,
    exitCodes,
    lifecycle: {
      addListener: (signal, listener) => listeners.set(signal, listener),
      removeListener: (signal, listener) => {
        if (listeners.get(signal) === listener) listeners.delete(signal);
      },
      setExitCode: (code) => exitCodes.push(code),
    },
  };
}

describe('runExecutable signal lifecycle', () => {
  it('keeps a server open without a shutdown signal until it closes independently', async () => {
    const controlled = createLifecycle();
    let resolveClosed: () => void = () => undefined;
    const close = vi.fn(async () => resolveClosed());
    const server: RunningWebServer = {
      url: 'http://127.0.0.1:4173',
      close,
      closed: new Promise<void>((resolve) => { resolveClosed = resolve; }),
    };
    const runCli = vi.fn(async (_argv, _io, dependencies) => {
      await dependencies.startWebServer({
        webRoot: 'web', assetsRoot: 'assets', host: '127.0.0.1', port: 4173, open: false,
      });
      expect(close).not.toHaveBeenCalled();
      resolveClosed();
      await server.closed;
      return 0;
    });

    await expect(runExecutable(['web'], controlled.lifecycle, { runCli, startWebServer: async () => server })).resolves.toBe(0);
    expect(close).not.toHaveBeenCalled();
    expect(controlled.exitCodes).toEqual([]);
    expect(controlled.listeners).toEqual(new Map());
  });

  it('preserves SIGINT exit code after server closure and removes listeners', async () => {
    const controlled = createLifecycle();
    let resolveClosed: () => void = () => undefined;
    const close = vi.fn(async () => resolveClosed());
    const server: RunningWebServer = {
      url: 'http://127.0.0.1:4173',
      close,
      closed: new Promise<void>((resolve) => { resolveClosed = resolve; }),
    };
    const runCli = vi.fn(async (_argv, _io, dependencies) => {
      await dependencies.startWebServer({
        webRoot: 'web', assetsRoot: 'assets', host: '127.0.0.1', port: 4173, open: false,
      });
      controlled.listeners.get('SIGINT')!();
      await server.closed;
      return 0;
    });

    await expect(runExecutable(['web'], controlled.lifecycle, { runCli, startWebServer: async () => server })).resolves.toBe(130);
    expect(close).toHaveBeenCalledOnce();
    expect(controlled.exitCodes).toEqual([130]);
    expect(controlled.listeners).toEqual(new Map());
  });

  it('closes a server that becomes available after SIGTERM during startup', async () => {
    const controlled = createLifecycle();
    let resolveStart: (server: RunningWebServer) => void = () => undefined;
    const start = new Promise<RunningWebServer>((resolve) => { resolveStart = resolve; });
    const close = vi.fn(async () => undefined);
    const server: RunningWebServer = {
      url: 'http://127.0.0.1:4173', close, closed: Promise.resolve(),
    };
    const runCli = vi.fn(async (_argv, _io, dependencies) => {
      const starting = dependencies.startWebServer({
        webRoot: 'web', assetsRoot: 'assets', host: '127.0.0.1', port: 4173, open: false,
      });
      controlled.listeners.get('SIGTERM')!();
      resolveStart(server);
      await starting;
      return 0;
    });

    await expect(runExecutable(['web'], controlled.lifecycle, { runCli, startWebServer: async () => start })).resolves.toBe(143);
    expect(close).toHaveBeenCalledOnce();
    expect(controlled.exitCodes).toEqual([143]);
    expect(controlled.listeners).toEqual(new Map());
  });
});
