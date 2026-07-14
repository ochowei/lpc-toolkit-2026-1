import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function readJson(target, errors, label) {
  try {
    return JSON.parse(readFileSync(target, 'utf8'));
  } catch (error) {
    errors.push(`${label} must contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

function requireFile(root, relativePath, errors) {
  if (!existsSync(path.join(root, relativePath))) errors.push(`${relativePath} is missing.`);
}

function isRegularFileWithin(root, relativePath) {
  if (typeof relativePath !== 'string') return false;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, target);
  const contained = relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
  if (!contained) return false;
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}

export function validatePluginRepository(repoRoot) {
  const errors = [];
  const pluginRelative = 'plugins/lpc-toolkit';
  const pluginRoot = path.join(repoRoot, pluginRelative);
  const manifestPath = path.join(pluginRoot, '.codex-plugin/plugin.json');
  const marketplacePath = path.join(repoRoot, '.agents/plugins/marketplace.json');

  requireFile(repoRoot, `${pluginRelative}/.codex-plugin/plugin.json`, errors);
  requireFile(repoRoot, '.agents/plugins/marketplace.json', errors);
  if (errors.length > 0) return errors;

  const manifest = readJson(manifestPath, errors, 'plugin manifest');
  const marketplace = readJson(marketplacePath, errors, 'repository marketplace');
  if (!manifest || !marketplace) return errors;

  if (manifest.name !== 'lpc-toolkit') errors.push('plugin manifest name must be lpc-toolkit.');
  if (manifest.version !== '0.1.0') errors.push('plugin manifest version must be 0.1.0.');
  if (manifest.license !== 'GPL-3.0-or-later') errors.push('plugin manifest license must be GPL-3.0-or-later.');
  if (manifest.skills !== './skills/') errors.push('plugin manifest skills must point to ./skills/.');

  const skillRoot = path.join(pluginRoot, String(manifest.skills ?? ''));
  const skillFiles = existsSync(skillRoot)
    ? readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(skillRoot, entry.name, 'SKILL.md'))
      .filter(existsSync)
    : [];
  if (skillFiles.length !== 1) errors.push('plugin must contain exactly one bundled skill.');

  for (const field of ['composerIcon', 'logo']) {
    const relative = manifest.interface?.[field];
    if (!isRegularFileWithin(pluginRoot, relative)) {
      errors.push(`plugin interface ${field} must point to an existing asset.`);
    }
  }

  if (marketplace.name !== 'lpc-toolkit') errors.push('marketplace name must be lpc-toolkit.');
  const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  const entry = entries.find((candidate) => candidate?.name === 'lpc-toolkit');
  if (!entry) {
    errors.push('marketplace must expose the lpc-toolkit plugin.');
  } else {
    if (entry.source?.source !== 'local' || entry.source?.path !== './plugins/lpc-toolkit') {
      errors.push('marketplace plugin source must be ./plugins/lpc-toolkit.');
    }
    if (entry.policy?.installation !== 'AVAILABLE') errors.push('marketplace installation policy must be AVAILABLE.');
    if (entry.policy?.authentication !== 'ON_INSTALL') errors.push('marketplace authentication policy must be ON_INSTALL.');
  }

  for (const relativePath of ['.mcp.json', '.app.json', 'hooks']) {
    if (existsSync(path.join(pluginRoot, relativePath))) {
      errors.push(`${pluginRelative}/${relativePath} is forbidden in the first plugin version.`);
    }
  }
  return errors;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const repoRoot = path.resolve(path.dirname(currentFile), '..');
  const errors = validatePluginRepository(repoRoot);
  if (errors.length > 0) {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('Codex plugin structure is valid.\n');
  }
}
