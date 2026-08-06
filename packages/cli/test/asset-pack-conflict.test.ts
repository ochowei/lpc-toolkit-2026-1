import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initializeAssetWorkspace } from '../src/asset-workspace.js';
import { runCli } from '../src/main.js';
import { createD6ConflictFixture } from './fixtures/asset-pack-conflict.js';

function writeJson(filePath: string, value: unknown): string {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

async function invoke(
  cwd: string,
  argv: readonly string[],
): Promise<{ readonly code: number; readonly stdout: unknown; readonly stdoutText: string; readonly stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(argv, {
    cwd,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  });
  return {
    code,
    stdout: stdout.length === 0
      ? null
      : (() => {
        try {
          return JSON.parse(stdout.join('')) as unknown;
        } catch {
          return stdout.join('');
        }
      })(),
    stdoutText: stdout.join(''),
    stderr: stderr.join(''),
  };
}

describe('asset conflict CLI', () => {
  it('documents inspect, resolve, and recover as an explicit review workflow', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d6-help-'));
    const result = await invoke(cwd, ['asset', 'conflict', '--help']);
    expect(result.code).toBe(0);
    expect(result.stdoutText).toContain('asset conflict inspect');
    expect(result.stdoutText).toContain('automatic winner');
  });

  it('inspects a local conflict read-only and reports one safe next action', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d6-inspect-'));
    const fixture = createD6ConflictFixture();
    const conflictPath = writeJson(path.join(cwd, 'conflict.json'), fixture.conflict);
    const result = await invoke(cwd, [
      'asset', 'conflict', 'inspect', '--conflict', conflictPath, '--json',
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatchObject({
      ok: true,
      command: 'asset conflict inspect',
      data: {
        status: 'selection-required',
        conflictId: fixture.conflict.conflictId,
        mutation: 'none',
        nextAction: 'select-all-targets',
      },
    });
  });

  it('requires confirmation and stages only a workspace-owned resolution receipt', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'lpc-d6-resolve-'));
    const workspace = initializeAssetWorkspace(path.join(cwd, 'workspace'));
    const fixture = createD6ConflictFixture();
    const conflictPath = writeJson(path.join(workspace.root, 'conflict.json'), fixture.conflict);
    const selectionPath = writeJson(path.join(workspace.root, 'selection.json'), fixture.selection);

    const needsConfirmation = await invoke(cwd, [
      'asset', 'conflict', 'resolve',
      '--conflict', conflictPath,
      '--selection', selectionPath,
      '--workspace', workspace.root,
      '--json',
    ]);
    expect(needsConfirmation.code).toBe(0);
    expect(needsConfirmation.stdout).toMatchObject({
      ok: true,
      data: {
        status: 'needs-user-action',
        code: 'conflict_requires_confirmation',
        mutation: 'none',
        nextAction: 'confirm-resolution',
      },
    });

    const resolved = await invoke(cwd, [
      'asset', 'conflict', 'resolve',
      '--conflict', conflictPath,
      '--selection', selectionPath,
      '--workspace', workspace.root,
      '--confirm',
      '--json',
    ]);
    expect(resolved.code).toBe(0);
    expect(resolved.stdout).toMatchObject({
      ok: true,
      data: {
        status: 'resolved',
        mutation: 'staged',
        nextAction: 'import-resolution-candidate',
      },
    });
    const receiptPath = (resolved.stdout as { readonly data: { readonly receiptPath: string } }).data.receiptPath;
    expect(receiptPath).not.toContain(workspace.root);
    expect(existsSync(path.join(workspace.root, receiptPath))).toBe(true);
    const receipt = JSON.parse(readFileSync(path.join(workspace.root, receiptPath), 'utf8')) as {
      readonly audit: { readonly schema: string; readonly events: readonly { readonly event: string }[] };
    };
    expect(receipt.audit.schema).toBe('lpc-toolkit.asset-pack-conflict-audit.v1');
    expect(receipt.audit.events.map((event) => event.event)).toEqual([
      'inspected',
      'selection-required',
      'resolved',
    ]);

    const recovered = await invoke(cwd, [
      'asset', 'conflict', 'recover',
      '--receipt', receiptPath,
      '--conflict', conflictPath,
      '--action', 'resume',
      '--workspace', workspace.root,
      '--confirm',
      '--json',
    ]);
    expect(recovered.stdout).toMatchObject({
      ok: true,
      data: {
        status: 'recovered',
        mutation: 'none',
        nextAction: 'import-resolution-candidate',
      },
    });

    const receiptAbsolutePath = path.join(workspace.root, receiptPath);
    const originalReceipt = readFileSync(receiptAbsolutePath, 'utf8');
    const tamperedReceipt = JSON.parse(originalReceipt) as Record<string, unknown>;
    tamperedReceipt.resolutionDigest = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    writeFileSync(receiptAbsolutePath, `${JSON.stringify(tamperedReceipt, null, 2)}\n`);
    const tampered = await invoke(cwd, [
      'asset', 'conflict', 'recover',
      '--receipt', receiptPath,
      '--action', 'resume',
      '--workspace', workspace.root,
      '--confirm',
      '--json',
    ]);
    expect(tampered.stdout).toMatchObject({
      ok: true,
      data: {
        status: 'needs-user-action',
        code: 'conflict_resolution_tampered',
        nextAction: 'discard-resolution',
      },
    });

    writeFileSync(receiptAbsolutePath, originalReceipt);
    const discarded = await invoke(cwd, [
      'asset', 'conflict', 'recover',
      '--receipt', receiptPath,
      '--action', 'discard',
      '--workspace', workspace.root,
      '--confirm',
      '--json',
    ]);
    expect(discarded.stdout).toMatchObject({
      ok: true,
      data: { status: 'discarded', mutation: 'staging-discarded', nextAction: 'none' },
    });
    expect(existsSync(receiptAbsolutePath)).toBe(false);
    expect(existsSync(workspace.packsRoot)).toBe(true);
  });
});
