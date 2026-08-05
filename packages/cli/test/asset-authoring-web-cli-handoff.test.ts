import {
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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
});
