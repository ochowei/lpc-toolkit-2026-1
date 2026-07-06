import { describe, expect, it } from 'vitest';
import { runCli } from '../src/main.js';

describe('main json behavior', () => {
  it('writes machine-readable unknown command errors to stdout', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const code = await runCli(['nope', '--json'], {
      cwd: process.cwd(),
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    });

    expect(code).toBe(1);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      ok: false,
      command: 'nope',
      errors: [{ code: 'unknown_command' }],
    });
  });
});
