import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../src/main.js';

describe('runCli', () => {
  it('prints help for no command', async () => {
    const writes: string[] = [];
    const errors: string[] = [];

    const code = await runCli([], {
      stdout: (text) => writes.push(text),
      stderr: (text) => errors.push(text),
      cwd: '/tmp',
    });

    const staleShortCommand = ['  ', 'lpc catalog types'].join('');

    expect(code).toBe(0);
    expect(writes.join('')).toContain('lpc-toolkit catalog types');
    expect(writes.join('')).not.toContain(staleShortCommand);
    expect(errors).toEqual([]);
  });

  it('reports missing selection files as json responses', async () => {
    const writes: string[] = [];
    const errors: string[] = [];

    const code = await runCli(['selection', 'validate', '--selection', 'missing.json', '--json'], {
      stdout: (text) => writes.push(text),
      stderr: (text) => errors.push(text),
      cwd: '/tmp',
    });

    const response = JSON.parse(writes.join('')) as {
      readonly ok: boolean;
      readonly errors: readonly { readonly code: string }[];
    };

    expect(code).toBe(1);
    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe('selection_read_failed');
    expect(errors).toEqual([]);
  });

  it('reports malformed selection json as json responses', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-cli-'));
    writeFileSync(path.join(cwd, 'selection.json'), '{');
    const writes: string[] = [];
    const errors: string[] = [];

    const code = await runCli(['selection', 'validate', '--selection', 'selection.json', '--json'], {
      stdout: (text) => writes.push(text),
      stderr: (text) => errors.push(text),
      cwd,
    });

    const response = JSON.parse(writes.join('')) as {
      readonly ok: boolean;
      readonly errors: readonly { readonly code: string }[];
    };

    expect(code).toBe(1);
    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe('invalid_selection_json');
    expect(errors).toEqual([]);
  });

  it('reports unsupported selection schemas as json responses', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-cli-'));
    writeFileSync(
      path.join(cwd, 'selection.json'),
      JSON.stringify({ schema: 'other', bodyType: 'male', items: {} }),
    );
    const writes: string[] = [];
    const errors: string[] = [];

    const code = await runCli(['selection', 'validate', '--selection', 'selection.json', '--json'], {
      stdout: (text) => writes.push(text),
      stderr: (text) => errors.push(text),
      cwd,
    });

    const response = JSON.parse(writes.join('')) as {
      readonly ok: boolean;
      readonly errors: readonly { readonly code: string }[];
    };

    expect(code).toBe(1);
    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe('invalid_selection_json');
    expect(errors).toEqual([]);
  });
});
