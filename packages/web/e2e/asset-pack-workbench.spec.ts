import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { expect, test, type Page } from '@playwright/test';
import {
  ASSET_PACK_FIXTURE,
  createAssetPackFixtureArchive,
  createWalkPng,
} from './helpers/asset-pack-fixture';

const webPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(webPackageRoot, '../..');
const cliEntry = path.join(repoRoot, 'packages/cli/dist/index.js');

interface CliResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

async function manifestAt(archivePath: string): Promise<Record<string, unknown>> {
  const archive = await JSZip.loadAsync(await readFile(archivePath));
  const manifestFile = archive.file('asset-pack.json');
  if (!manifestFile) throw new Error('Downloaded archive is missing asset-pack.json.');
  return JSON.parse(await manifestFile.async('text')) as Record<string, unknown>;
}

function runBuiltCli(args: readonly string[], cwd = repoRoot): CliResult {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, LPC_TOOLKIT_CACHE_DIR: path.join(cwd, '.lpc-toolkit-cache') },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function jsonOutput(result: CliResult): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

function assertContained(root: string, candidate: unknown): void {
  expect(typeof candidate).toBe('string');
  const relative = path.relative(root, candidate as string);
  expect(relative).not.toMatch(/^\.\.(?:[\\/]|$)/u);
  expect(path.isAbsolute(relative)).toBe(false);
}

async function chooseFile(page: Page, file: { readonly name: string; readonly type: string; readonly bytes: Uint8Array }): Promise<void> {
  await page.locator('#asset-pack-file').setInputFiles({
    name: file.name,
    mimeType: file.type,
    buffer: Buffer.from(file.bytes),
  });
}

test('proves browser repair, attributed downloads, and CLI lifecycle handoff', async ({ page }) => {
  const workspaceRoot = await mkdtemp(path.join(repoRoot, '.task-14-e2e-'));
  try {
    const formalFixture = await createAssetPackFixtureArchive();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`);
    });
    await page.goto('/asset-packs');
    await chooseFile(page, {
      name: 'acme.wind-braid-1.0.0.lpc-assets.zip',
      type: 'application/zip',
      bytes: formalFixture,
    });
    await expect(page.getByText(/^Current pack:/u)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByLabel('Pack ID')).toHaveValue(ASSET_PACK_FIXTURE.id, { timeout: 120_000 });
    expect(pageErrors).toEqual([]);
    await expect(page.getByLabel('Display name')).toHaveValue(ASSET_PACK_FIXTURE.displayName);
    await expect(page.getByText(/Official base:/u)).toBeVisible();
    const attribution = page.getByLabel('Asset pack attribution');
    await expect(attribution.getByText(ASSET_PACK_FIXTURE.author, { exact: true })).toBeVisible();
    await expect(attribution).toContainText('bluecarrot16');

    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    const source = page.getByRole('heading', { name: ASSET_PACK_FIXTURE.sourcePath, exact: true }).locator('..');
    await source.getByText('Replace', { exact: true }).locator('input[type=file]').setInputFiles({
      name: 'replacement.png',
      mimeType: 'image/png',
      buffer: createWalkPng('#0055aa'),
    });
    await expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Warnings', exact: true }).click();
    const warningArticles = page.locator('section[aria-labelledby="asset-pack-warnings-heading"] article');
    await expect(warningArticles).toHaveCount(1);
    await expect(warningArticles.getByText('Set the release version first before confirming this warning.')).toBeVisible();
    await expect(warningArticles.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();

    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByLabel('Version', { exact: true }).fill('1.0.1');
    await page.getByRole('button', { name: 'Save overview', exact: true }).click();
    await expect(page.getByLabel('Version', { exact: true })).toHaveValue('1.0.1');
    await page.getByRole('button', { name: 'Warnings', exact: true }).click();
    await warningArticles.getByLabel('Reason').fill('The male-only drawing is intentional for this release.');
    await expect(warningArticles.getByRole('button', { name: 'Confirm', exact: true })).toBeEnabled();
    await warningArticles.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(warningArticles.getByText('Confirmed', { exact: true })).toBeVisible();

    page.on('dialog', (dialog) => dialog.accept());
    const draftDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download draft archive', exact: true }).click();
    const draftDownload = await draftDownloadPromise;
    const draftArchive = path.join(workspaceRoot, 'browser-draft.lpc-assets.zip');
    await draftDownload.saveAs(draftArchive);
    expect((await manifestAt(draftArchive)).status).toBe('draft');

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.locator('#asset-pack-file').setInputFiles(draftArchive);
    await expect(page.getByLabel('Pack ID')).toHaveValue(ASSET_PACK_FIXTURE.id);
    await page.getByRole('button', { name: 'Warnings', exact: true }).click();
    await expect(page.locator('section[aria-labelledby="asset-pack-warnings-heading"] .text-green-700')).toHaveCount(1);
    await page.getByRole('button', { name: 'Sources', exact: true }).click();
    await expect(page.getByRole('heading', { name: ASSET_PACK_FIXTURE.sourcePath, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Manifest', exact: true }).click();
    await page.getByRole('button', { name: 'Raw repair', exact: true }).click();
    const rawManifest = page.getByRole('textbox', { name: 'Raw manifest repair', exact: true });
    await expect(rawManifest).toHaveValue(/"schema"/u);
    const survivedManifest = JSON.parse(await rawManifest.inputValue()) as Record<string, unknown>;
    expect(survivedManifest.status).toBe('draft');
    expect(survivedManifest.acknowledgements).toHaveLength(1);
    expect(JSON.stringify(survivedManifest)).toContain(ASSET_PACK_FIXTURE.sourcePath);
    delete survivedManifest.status;
    await rawManifest.fill(`${JSON.stringify(survivedManifest, null, 2)}\n`);
    await page.getByRole('button', { name: 'Apply repair', exact: true }).click();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await page.getByLabel('Version', { exact: true }).fill('1.0.2');
    await page.getByRole('button', { name: 'Save overview', exact: true }).click();
    await expect(page.getByLabel('Version', { exact: true })).toHaveValue('1.0.2');
    await expect(page.getByText('Revision 2', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Warnings', exact: true }).click();
    const finalWarningArticles = page.locator('section[aria-labelledby="asset-pack-warnings-heading"] article');
    await finalWarningArticles.getByLabel('Reason').fill('The male-only drawing remains intentional for this release.');
    await finalWarningArticles.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(finalWarningArticles.getByText('Confirmed', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Manifest', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download formal archive', exact: true })).toBeEnabled();

    const formalDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download formal archive', exact: true }).click();
    const formalDownload = await formalDownloadPromise;
    const formalArchive = path.join(workspaceRoot, 'browser-formal.lpc-assets.zip');
    await formalDownload.saveAs(formalArchive);
    expect((await manifestAt(formalArchive)).status).toBeUndefined();

    const initialized = runBuiltCli(['asset', 'workspace', 'init', workspaceRoot, '--json']);
    expect(initialized.status, initialized.stderr).toBe(0);
    const draftInspection = runBuiltCli(['asset', 'inspect', draftArchive, '--json']);
    expect(draftInspection.status).toBe(1);
    expect(jsonOutput(draftInspection).data).toMatchObject({ status: 'draft' });
    const beforeDraftInstall = await readFile(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8');
    const draftInstall = runBuiltCli(['asset', 'install', draftArchive, '--workspace', workspaceRoot, '--json']);
    expect(draftInstall.status).toBe(1);
    expect(draftInstall.stdout).toMatch(/asset_pack_draft/u);
    expect(await readFile(path.join(workspaceRoot, 'lpc-asset-workspace.json'), 'utf8')).toBe(beforeDraftInstall);

    const formalInspection = runBuiltCli(['asset', 'inspect', formalArchive, '--json']);
    expect(formalInspection.status).toBe(0);
    expect(jsonOutput(formalInspection).data).toMatchObject({ valid: true, packId: ASSET_PACK_FIXTURE.id, version: '1.0.2' });
    const formalInstall = runBuiltCli(['asset', 'install', formalArchive, '--workspace', workspaceRoot, '--json']);
    expect(formalInstall.status, formalInstall.stderr).toBe(0);
    expect(jsonOutput(formalInstall).data).toMatchObject({ action: 'installed', packId: ASSET_PACK_FIXTURE.id, version: '1.0.2' });
    const doctor = runBuiltCli(['asset', 'doctor', '--workspace', workspaceRoot, '--json']);
    expect(doctor.status, doctor.stderr).toBe(0);
    const doctorData = jsonOutput(doctor).data as Record<string, unknown>;
    expect(doctorData.healthy).toBe(true);
    assertContained(workspaceRoot, (jsonOutput(formalInstall).data as Record<string, unknown>).installedDirectory);
    for (const check of (doctorData.checks as readonly Record<string, unknown>[])) {
      if (typeof check.path === 'string') assertContained(workspaceRoot, check.path);
    }
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
