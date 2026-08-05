import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseAssetAuthoringWebHandoffReceiptJson } from '@lpc-toolkit/core';
import { afterEach, describe, expect, it } from 'vitest';
import {
  extractVerifiedAssetPackPayload,
  readAssetPackArchive,
} from '../src/asset-pack-archive-format.js';
import { inspectAssetWebCliHandoff } from '../src/asset-authoring-web-cli-handoff.js';
import {
  createAssetPackInstallStagingRoot,
  initializeAssetWorkspace,
} from '../src/asset-workspace.js';
import { runCli, type CliIo } from '../src/main.js';
import { createD3WebCliFixtures } from './fixtures/d3-web-cli-fixtures.js';

const temporaryDirectories: string[] = [];

function createDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'lpc-d3-handoff-inspect-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeInputs(directory: string, handoffText: string, archiveBytes: Uint8Array): {
  readonly handoffPath: string;
  readonly archivePath: string;
} {
  const handoffPath = path.join(directory, 'handoff.json');
  const archivePath = path.join(directory, 'pack.lpc-assets.zip');
  writeFileSync(handoffPath, handoffText);
  writeFileSync(archivePath, archiveBytes);
  return { handoffPath, archivePath };
}

function ioFor(cwd: string): { readonly io: CliIo; readonly stdout: string[]; readonly stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      cwd,
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    },
  };
}

function jsonData(stdout: readonly string[]): Readonly<Record<string, unknown>> {
  const response = JSON.parse(stdout.join('')) as Readonly<Record<string, unknown>>;
  const data = response.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Expected a JSON data object.');
  }
  return data as Readonly<Record<string, unknown>>;
}

async function createInterruptedRecovery(
  workspace: ReturnType<typeof initializeAssetWorkspace>,
  directory: string,
  fixtures: Awaited<ReturnType<typeof createD3WebCliFixtures>>,
): Promise<{ readonly stagingPath: string; readonly markerPath: string }> {
  const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
  const inspected = await inspectAssetWebCliHandoff({ handoffPath, archivePath });
  if (!inspected.ok || inspected.data.state !== 'current') {
    throw new Error('Expected a current handoff fixture.');
  }
  const archive = await readAssetPackArchive({ archivePath });
  if (!archive.ok) throw new Error('Expected a verified archive fixture.');
  const stagingRoot = createAssetPackInstallStagingRoot(
    workspace,
    (targetDirectory) => extractVerifiedAssetPackPayload({
      snapshot: archive.snapshot,
      targetDirectory,
    }),
  );
  const stagingPath = stagingRoot.path;
  const markerPath = path.join(workspace.stagingRoot, 'web-handoff-recovery.json');
  writeFileSync(markerPath, `${JSON.stringify({
    schema: 'lpc-toolkit.asset-authoring-web-handoff-recovery.v1',
    handoffId: fixtures.handoff.handoffId,
    handoffDigest: inspected.data.binding.handoffDigest,
    binding: inspected.data.binding,
    plan: fixtures.attachPlan,
    planDigest: fixtures.interruptedStaging.planDigest,
    stagingDirectory: path.basename(stagingPath),
    createdAt: '2026-08-06T12:00:00.000Z',
  })}\n`);
  return { stagingPath, markerPath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset authoring Web-to-CLI handoff inspection', () => {
  it('reports a current pair without discovering a workspace or writing files', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const output = ioFor(directory);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--json',
    ], output.io, {
      findAssetWorkspace: () => { throw new Error('handoff inspection must not discover a workspace'); },
    });

    expect(code).toBe(0);
    expect(output.stderr).toEqual([]);
    const data = jsonData(output.stdout);
    const binding = data.binding;
    if (typeof binding !== 'object' || binding === null || Array.isArray(binding)) {
      throw new Error('Expected a handoff binding object.');
    }
    const bindingRecord = binding as Readonly<Record<string, unknown>>;
    expect(data.state).toBe('current');
    expect(data.handoffId).toBe(fixtures.handoff.handoffId);
    expect(bindingRecord.archiveDigest).toBe(fixtures.handoff.payload.archiveDigest);
    expect(data.nextAction).toEqual(expect.objectContaining({
      id: 'import-handoff',
      command: 'asset authoring handoff import --handoff <handoff.json> --archive <pack.lpc-assets.zip> --plan <attach-pack-plan.json> --confirm',
    }));
  });

  it('reports a stale pair when the selected archive is not the exported archive', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.staleArchiveBytes);
    const output = ioFor(directory);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--json',
    ], output.io);

    expect(code).toBe(1);
    const data = jsonData(output.stdout);
    expect(data.state).toBe('stale');
    expect(data.mismatches).toContain('archiveDigest');
    expect(data.nextAction).toEqual(expect.objectContaining({
      id: 'export-fresh-handoff',
      summary: 'Export a fresh Web-to-CLI archive and handoff sidecar from one revision.',
    }));
  });

  it('blocks unknown sidecar fields before archive inspection', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const unsafeHandoff = `${fixtures.handoffJson.trimEnd().slice(0, -1)},"workspaceRoot":"/private/secret"}\n`;
    const { handoffPath, archivePath } = writeInputs(directory, unsafeHandoff, fixtures.archiveBytes);
    const output = ioFor(directory);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--json',
    ], output.io);

    expect(code).toBe(1);
    const response = JSON.parse(output.stdout.join('')) as Readonly<Record<string, unknown>>;
    expect(response.ok).toBe(false);
    expect(response.data).toBeNull();
    expect(response.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_web_cli_handoff_blocked' }),
    ]));
  });

  it('blocks a tampered archive or symlinked handoff input before any import path exists', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.tamperedArchiveBytes);
    const tamperedOutput = ioFor(directory);

    const tamperedCode = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--json',
    ], tamperedOutput.io);

    expect(tamperedCode).toBe(1);
    expect(JSON.parse(tamperedOutput.stdout.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_web_cli_handoff_blocked' }),
    ]));

    const validArchivePath = path.join(directory, 'valid-pack.lpc-assets.zip');
    writeFileSync(validArchivePath, fixtures.archiveBytes);
    const realHandoffPath = path.join(directory, 'real-handoff.json');
    writeFileSync(realHandoffPath, fixtures.handoffJson);
    const symlinkPath = path.join(directory, 'handoff-link.json');
    symlinkSync(realHandoffPath, symlinkPath);
    const symlinkOutput = ioFor(directory);
    const symlinkCode = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', symlinkPath,
      '--archive', validArchivePath,
      '--json',
    ], symlinkOutput.io);

    expect(symlinkCode).toBe(1);
    expect(JSON.parse(symlinkOutput.stdout.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_web_cli_handoff_blocked' }),
    ]));
  });

  it('reports attribution binding drift as stale even when the archive remains valid', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const { handoffPath, archivePath } = writeInputs(
      directory,
      `${JSON.stringify(fixtures.attributionHandoff)}\n`,
      fixtures.archiveBytes,
    );
    const output = ioFor(directory);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--json',
    ], output.io);

    expect(code).toBe(1);
    const data = jsonData(output.stdout);
    expect(data.state).toBe('stale');
    expect(data.mismatches).toContain('creditDigest');
  });

  it('uses stable human wording for a current handoff pair', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const output = ioFor(directory);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'inspect',
      '--handoff', handoffPath,
      '--archive', archivePath,
    ], output.io);

    expect(code).toBe(0);
    expect(output.stdout.join('')).toContain('Web-to-CLI handoff is current.');
    expect(output.stdout.join('')).toContain('Next action: Import only after reviewing the pair and selecting an attach-pack plan.');
  });

  it('pauses import without --confirm and leaves the selected workspace unchanged', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const planPath = path.join(directory, 'attach-pack-plan.json');
    writeFileSync(planPath, fixtures.attachPlanJson);
    const output = ioFor(workspace.root);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'import',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--plan', planPath,
      '--json',
    ], output.io);

    expect(code).toBe(0);
    const data = jsonData(output.stdout);
    expect(data.state).toBe('needs-user-action');
    expect(data.sessionId).toBeNull();
    expect(data.nextAction).toEqual(expect.objectContaining({ id: 'confirm-handoff-import' }));
    expect(existsSync(path.join(workspace.packsRoot, fixtures.handoff.pack.id))).toBe(false);
    expect(existsSync(path.join(workspace.stateRoot, 'authoring-sessions'))).toBe(false);
  });

  it('imports into a new attach-pack session, writes a separate receipt, and is idempotent', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const planPath = path.join(directory, 'attach-pack-plan.json');
    writeFileSync(planPath, fixtures.attachPlanJson);

    const runImport = async () => {
      const output = ioFor(workspace.root);
      const code = await runCli([
        'asset', 'authoring', 'handoff', 'import',
        '--handoff', handoffPath,
        '--archive', archivePath,
        '--plan', planPath,
        '--confirm',
        '--json',
      ], output.io);
      return { code, data: jsonData(output.stdout), output };
    };

    const first = await runImport();
    expect(first.code).toBe(0);
    expect(first.data.state).toBe('imported');
    expect(first.data.idempotent).toBe(false);
    const sessionId = first.data.sessionId;
    if (typeof sessionId !== 'string') throw new Error('Expected the imported session id.');
    const packRoot = path.join(workspace.packsRoot, fixtures.handoff.pack.id);
    const sessionRoot = path.join(workspace.stateRoot, 'authoring-sessions', sessionId);
    expect(readFileSync(path.join(packRoot, 'asset-pack.json'))).toEqual(expect.any(Buffer));
    expect(existsSync(path.join(sessionRoot, 'session.json'))).toBe(true);
    expect(existsSync(path.join(sessionRoot, 'manifest.snapshot.json'))).toBe(true);
    const receiptPath = path.join(sessionRoot, 'web-handoff-receipt.json');
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = parseAssetAuthoringWebHandoffReceiptJson(readFileSync(receiptPath, 'utf8'));
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) throw new Error('Expected a valid Web-handoff receipt.');
    expect(receipt.receipt).toMatchObject({
      handoffId: fixtures.handoff.handoffId,
      archiveDigest: fixtures.handoff.payload.archiveDigest,
      sessionId,
      status: 'imported',
    });
    expect(JSON.stringify(receipt.receipt)).not.toMatch(/\/Users\/|\/private\/|password|token|prompt/iu);
    const session = JSON.parse(readFileSync(path.join(sessionRoot, 'session.json'), 'utf8')) as Readonly<Record<string, unknown>>;
    expect(session.receipts).not.toHaveProperty('webHandoff');
    expect(session.phase).toBe('scaffolded');
    expect(session.reason).toBe('pack-attached');

    const second = await runImport();
    expect(second.code).toBe(0);
    expect(second.data.state).toBe('imported');
    expect(second.data.idempotent).toBe(true);
    expect(second.data.sessionId).toBe(sessionId);
    expect(readdirSync(workspace.packsRoot)).toEqual([fixtures.handoff.pack.id]);
  });

  it('refuses a changed attach plan instead of overwriting the imported pack', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const planPath = path.join(directory, 'attach-pack-plan.json');
    writeFileSync(planPath, fixtures.attachPlanJson);
    const firstOutput = ioFor(workspace.root);
    await runCli([
      'asset', 'authoring', 'handoff', 'import',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--plan', planPath,
      '--confirm',
      '--json',
    ], firstOutput.io);
    const originalManifest = readFileSync(path.join(workspace.packsRoot, fixtures.handoff.pack.id, 'asset-pack.json'));
    const changedPlan = { ...fixtures.attachPlan, pack: { ...fixtures.attachPlan.pack, displayName: 'Changed plan label' } };
    writeFileSync(planPath, `${JSON.stringify(changedPlan)}\n`);
    const output = ioFor(workspace.root);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'import',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--plan', planPath,
      '--confirm',
      '--json',
    ], output.io);

    expect(code).toBe(1);
    expect(JSON.parse(output.stdout.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_web_cli_handoff_import_conflict' }),
    ]));
    expect(readFileSync(path.join(workspace.packsRoot, fixtures.handoff.pack.id, 'asset-pack.json'))).toEqual(originalManifest);
  });

  it('describes the pending and imported boundaries in human output', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const planPath = path.join(directory, 'attach-pack-plan.json');
    writeFileSync(planPath, fixtures.attachPlanJson);

    const pending = ioFor(workspace.root);
    const pendingCode = await runCli([
      'asset', 'authoring', 'handoff', 'import',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--plan', planPath,
    ], pending.io);
    if (pendingCode !== 0) throw new Error(`Pending recovery failed: ${pending.stdout.join('')} ${pending.stderr.join('')}`);
    expect(pending.stdout.join('')).toContain('ready for explicit CLI confirmation');
    expect(pending.stdout.join('')).toContain('Web handoff is not release approval.');

    const imported = ioFor(workspace.root);
    const importedCode = await runCli([
      'asset', 'authoring', 'handoff', 'import',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--plan', planPath,
      '--confirm',
    ], imported.io);
    expect(importedCode).toBe(0);
    expect(imported.stdout.join('')).toContain('imported into a new CLI authoring session');
    expect(imported.stdout.join('')).toContain('Web handoff is not release approval.');
  });

  it('requires confirmation and discards only the exact pending staging directory', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const { stagingPath, markerPath } = await createInterruptedRecovery(workspace, directory, fixtures);
    const sentinelPath = path.join(workspace.root, 'outside-sentinel.txt');
    writeFileSync(sentinelPath, 'keep');
    const handoffBefore = readFileSync(handoffPath);
    const archiveBefore = readFileSync(archivePath);

    const pending = ioFor(workspace.root);
    const pendingCode = await runCli([
      'asset', 'authoring', 'handoff', 'recover',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--workspace', workspace.root,
      '--action', 'discard',
      '--json',
    ], pending.io);
    expect(pendingCode).toBe(0);
    expect(jsonData(pending.stdout)).toMatchObject({
      state: 'needs-user-action',
      action: 'discard',
      nextAction: { id: 'confirm-handoff-recovery' },
    });
    expect(existsSync(stagingPath)).toBe(true);
    expect(existsSync(markerPath)).toBe(true);

    const discarded = ioFor(workspace.root);
    const discardedCode = await runCli([
      'asset', 'authoring', 'handoff', 'recover',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--workspace', workspace.root,
      '--action', 'discard',
      '--confirm',
      '--json',
    ], discarded.io);
    expect(discardedCode).toBe(0);
    expect(jsonData(discarded.stdout)).toMatchObject({
      state: 'discarded',
      action: 'discard',
      nextAction: { id: 'import-handoff' },
    });
    expect(existsSync(stagingPath)).toBe(false);
    expect(existsSync(markerPath)).toBe(false);
    expect(readFileSync(handoffPath)).toEqual(handoffBefore);
    expect(readFileSync(archivePath)).toEqual(archiveBefore);
    expect(readFileSync(sentinelPath, 'utf8')).toBe('keep');
    expect(readdirSync(workspace.packsRoot)).toEqual([]);
  });

  it('resumes exact pending staging into a new session and receipt', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const { stagingPath, markerPath } = await createInterruptedRecovery(workspace, directory, fixtures);
    const output = ioFor(workspace.root);

    const code = await runCli([
      'asset', 'authoring', 'handoff', 'recover',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--workspace', workspace.root,
      '--action', 'resume',
      '--confirm',
      '--json',
    ], output.io);

    if (code !== 0) throw new Error(`Resume recovery failed: ${output.stdout.join('')} ${output.stderr.join('')}`);
    const data = jsonData(output.stdout);
    expect(data).toMatchObject({
      state: 'resumed',
      action: 'resume',
      nextAction: { id: 'validate-handoff-session' },
    });
    const sessionId = data.sessionId;
    if (typeof sessionId !== 'string') throw new Error('Expected a resumed session id.');
    expect(existsSync(stagingPath)).toBe(false);
    expect(existsSync(markerPath)).toBe(false);
    const packRoot = path.join(workspace.packsRoot, fixtures.handoff.pack.id);
    const sessionRoot = path.join(workspace.stateRoot, 'authoring-sessions', sessionId);
    expect(existsSync(path.join(packRoot, 'asset-pack.json'))).toBe(true);
    expect(existsSync(path.join(sessionRoot, 'web-handoff-receipt.json'))).toBe(true);
  });

  it('preserves pending recovery evidence when the selected archive is stale or staging is tampered', async () => {
    const fixtures = await createD3WebCliFixtures();
    const directory = createDirectory();
    const workspace = initializeAssetWorkspace(path.join(directory, 'workspace'));
    const { handoffPath, archivePath } = writeInputs(directory, fixtures.handoffJson, fixtures.archiveBytes);
    const { stagingPath, markerPath } = await createInterruptedRecovery(workspace, directory, fixtures);
    const staleArchivePath = path.join(directory, 'stale.lpc-assets.zip');
    writeFileSync(staleArchivePath, fixtures.staleArchiveBytes);
    const staleOutput = ioFor(workspace.root);

    const staleCode = await runCli([
      'asset', 'authoring', 'handoff', 'recover',
      '--handoff', handoffPath,
      '--archive', staleArchivePath,
      '--workspace', workspace.root,
      '--action', 'discard',
      '--confirm',
      '--json',
    ], staleOutput.io);
    expect(staleCode).toBe(1);
    expect(jsonData(staleOutput.stdout)).toMatchObject({ state: 'stale' });
    expect(existsSync(stagingPath)).toBe(true);
    expect(existsSync(markerPath)).toBe(true);

    writeFileSync(path.join(stagingPath, 'asset-pack.json'), '{}\n');
    const tamperedOutput = ioFor(workspace.root);
    const tamperedCode = await runCli([
      'asset', 'authoring', 'handoff', 'recover',
      '--handoff', handoffPath,
      '--archive', archivePath,
      '--workspace', workspace.root,
      '--action', 'discard',
      '--confirm',
      '--json',
    ], tamperedOutput.io);
    expect(tamperedCode).toBe(1);
    expect(JSON.parse(tamperedOutput.stdout.join(''))).toMatchObject({ ok: false });
    expect(existsSync(stagingPath)).toBe(true);
    expect(existsSync(markerPath)).toBe(true);
  });
});
