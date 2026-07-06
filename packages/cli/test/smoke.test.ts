import { describe, expect, it } from 'vitest';
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

    expect(code).toBe(0);
    expect(writes.join('')).toContain('lpc catalog types');
    expect(errors).toEqual([]);
  });
});
