import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validatePluginRepository } from './verify-codex-plugin.mjs';

function write(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function validFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lpc-plugin-verifier-'));
  write(root, '.agents/plugins/marketplace.json', JSON.stringify({
    name: 'lpc-toolkit',
    plugins: [{
      name: 'lpc-toolkit',
      source: { source: 'local', path: './plugins/lpc-toolkit' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
      category: 'Developer Tools',
    }],
  }));
  write(root, 'plugins/lpc-toolkit/.codex-plugin/plugin.json', JSON.stringify({
    name: 'lpc-toolkit',
    version: '0.2.1',
    description: 'Create attributed LPC characters and audit incomplete animation assets with the installed CLI.',
    license: 'GPL-3.0-or-later',
    skills: './skills/',
    interface: {
      composerIcon: './assets/icon.svg',
      logo: './assets/logo.svg',
    },
  }));
  write(root, 'plugins/lpc-toolkit/skills/animation-asset-audit/SKILL.md', `---\nname: lpc-animation-asset-audit\ndescription: Audit LPC animation assets.\n---\n`);
  write(root, 'plugins/lpc-toolkit/skills/character-authoring/SKILL.md', `---\nname: lpc-character-authoring\ndescription: Create LPC characters.\n---\n`);
  write(root, 'plugins/lpc-toolkit/assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  write(root, 'plugins/lpc-toolkit/assets/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  return root;
}

test('accepts the intended lightweight plugin structure', () => {
  const root = validFixture();
  try {
    assert.deepEqual(validatePluginRepository(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publishes the two-workflow presentation', () => {
  const manifest = JSON.parse(readFileSync(new URL(
    '../plugins/lpc-toolkit/.codex-plugin/plugin.json',
    import.meta.url,
  ), 'utf8'));
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const codexPluginSection = readme.split('### Codex Plugin', 2)[1]?.split('## ', 1)[0] ?? '';
  const cliReadme = readFileSync(new URL('../packages/cli/README.md', import.meta.url), 'utf8');
  const cliPluginSection = cliReadme.split('### Codex Plugin', 2)[1]?.split('## ', 1)[0] ?? '';
  const compatibility = readFileSync(new URL(
    '../plugins/lpc-toolkit/skills/character-authoring/references/compatibility.md',
    import.meta.url,
  ), 'utf8');
  const compatibilityVersion = /Plugin version `([^`]+)`/u.exec(compatibility)?.[1];

  assert.equal(manifest.version, '0.2.1');
  assert.match(manifest.description, /audit/u);
  assert.match(manifest.interface.longDescription, /drawing worklist/u);
  assert.equal(
    manifest.interface.defaultPrompt.some((prompt) => /incomplete.*animation/iu.test(prompt)),
    true,
  );
  for (const required of [
    'plugin `0.2.1`',
    'catalog audit-animations',
    'drawing worklist',
  ]) {
    assert.equal(
      codexPluginSection.includes(required),
      true,
      `missing Codex Plugin presentation: ${required}`,
    );
  }
  assert.equal(
    cliPluginSection.includes(`plugin \`${manifest.version}\``),
    true,
    `CLI README must document plugin \`${manifest.version}\``,
  );
  assert.equal(compatibilityVersion, manifest.version);
  assert.equal(
    cliPluginSection.includes(`plugin \`${compatibilityVersion}\``),
    true,
    'CLI README must match the plugin compatibility metadata',
  );
});

for (const skillName of ['animation-asset-audit', 'character-authoring']) {
  test(`rejects a plugin missing the intended ${skillName} skill`, () => {
    const root = validFixture();
    try {
      rmSync(path.join(root, `plugins/lpc-toolkit/skills/${skillName}`), {
        recursive: true,
        force: true,
      });
      assert.deepEqual(validatePluginRepository(root), [
        'plugin skills must be exactly: animation-asset-audit, character-authoring.',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('rejects an unexpected bundled skill', () => {
  const root = validFixture();
  try {
    write(root, 'plugins/lpc-toolkit/skills/unexpected/SKILL.md', `---\nname: unexpected\ndescription: Unexpected.\n---\n`);
    assert.deepEqual(validatePluginRepository(root), [
      'plugin skills must be exactly: animation-asset-audit, character-authoring.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects forbidden MCP, app, and hook components', () => {
  const root = validFixture();
  try {
    write(root, 'plugins/lpc-toolkit/.mcp.json', '{}\n');
    write(root, 'plugins/lpc-toolkit/.app.json', '{}\n');
    write(root, 'plugins/lpc-toolkit/hooks/hooks.json', '{}\n');
    assert.deepEqual(validatePluginRepository(root), [
      'plugins/lpc-toolkit/.mcp.json is forbidden by the lightweight plugin contract.',
      'plugins/lpc-toolkit/.app.json is forbidden by the lightweight plugin contract.',
      'plugins/lpc-toolkit/hooks is forbidden by the lightweight plugin contract.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('requires and records a user reason before allowing partial output', () => {
  const skill = readFileSync(new URL(
    '../plugins/lpc-toolkit/skills/character-authoring/SKILL.md',
    import.meta.url,
  ), 'utf8').replace(/\s+/g, ' ');

  assert.match(
    skill,
    /`--allow-partial` only when the user explicitly requests or accepts partial output, states a reason, and the workflow records that reason\./,
  );
});

test('states the character create locator exception in the top-level skill', () => {
  const skill = readFileSync(new URL(
    '../plugins/lpc-toolkit/skills/character-authoring/SKILL.md',
    import.meta.url,
  ), 'utf8').replace(/\s+/g, ' ');

  assert.match(
    skill,
    /For `character create`, provide the required name and use `--selection` only to choose an output path\. For every other character command, use exactly one locator: a name or `--selection`, never both\./,
  );
});

test('rejects plugin assets that escape the plugin root', () => {
  const root = validFixture();
  try {
    write(root, 'plugins/outside.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
    const manifestPath = path.join(root, 'plugins/lpc-toolkit/.codex-plugin/plugin.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.interface.composerIcon = '../outside.svg';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.deepEqual(validatePluginRepository(root), [
      'plugin interface composerIcon must point to an existing asset.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects plugin asset paths that name a directory', () => {
  const root = validFixture();
  try {
    const manifestPath = path.join(root, 'plugins/lpc-toolkit/.codex-plugin/plugin.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.interface.logo = './assets';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    assert.deepEqual(validatePluginRepository(root), [
      'plugin interface logo must point to an existing asset.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
