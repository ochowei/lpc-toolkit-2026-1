import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    version: '0.1.0',
    description: 'Create attributed LPC characters with the installed CLI.',
    license: 'GPL-3.0-or-later',
    skills: './skills/',
    interface: {
      composerIcon: './assets/icon.svg',
      logo: './assets/logo.svg',
    },
  }));
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

test('rejects forbidden MCP, app, and hook components', () => {
  const root = validFixture();
  try {
    write(root, 'plugins/lpc-toolkit/.mcp.json', '{}\n');
    write(root, 'plugins/lpc-toolkit/.app.json', '{}\n');
    write(root, 'plugins/lpc-toolkit/hooks/hooks.json', '{}\n');
    assert.deepEqual(validatePluginRepository(root), [
      'plugins/lpc-toolkit/.mcp.json is forbidden in the first plugin version.',
      'plugins/lpc-toolkit/.app.json is forbidden in the first plugin version.',
      'plugins/lpc-toolkit/hooks is forbidden in the first plugin version.',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
