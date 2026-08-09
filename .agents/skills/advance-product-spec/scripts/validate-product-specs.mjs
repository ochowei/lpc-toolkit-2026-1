#!/usr/bin/env node

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const PD_ID = /\bPD-(?:CAP|GRD|DEL|EVO|OPT)-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g;
const REQ_HEADING = /^### (REQ-[A-Z0-9]+(?:-[A-Z0-9]+)+) — (.+)$/gm;
const REQUIRED_HEADINGS = ['## Purpose', '## Scope', '### Supported', '### Excluded', '## Requirements'];

function parseArgs(argv) {
  const result = { root: process.cwd(), selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--self-test') {
      result.selfTest = true;
    } else if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) throw new Error('--root requires a directory');
      result.root = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function matches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const block = text.slice(4, end);
  const scalar = (key) => block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
  const directionStart = block.match(/^direction_objectives:\s*$/m);
  const directionObjectives = directionStart
    ? matches(block.slice(directionStart.index + directionStart[0].length), /^\s+-\s+(PD-[A-Z0-9-]+)\s*$/gm)
        .map((line) => line.trim().slice(2).trim())
    : [];
  return {
    capability: scalar('capability'),
    title: scalar('title'),
    status: scalar('status'),
    directionObjectives,
    body: text.slice(end + 5),
  };
}

function safeEvidencePath(repoRoot, candidate) {
  if (isAbsolute(candidate)) return null;
  const resolved = resolve(repoRoot, candidate);
  const rel = relative(repoRoot, resolved);
  if (rel === '..' || rel.startsWith(`..${sep}`)) return null;
  return resolved;
}

function listMarkdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function validateRepository(repoRoot) {
  const errors = [];
  const warnings = [];
  const englishPath = join(repoRoot, 'docs', 'PRODUCT-DIRECTION.md');
  const chinesePath = join(repoRoot, 'docs', 'PRODUCT-DIRECTION.zh-TW.md');
  const specsDirectory = join(repoRoot, 'docs', 'product-specs');

  if (!existsSync(englishPath)) errors.push('Missing docs/PRODUCT-DIRECTION.md');
  if (!existsSync(chinesePath)) errors.push('Missing docs/PRODUCT-DIRECTION.zh-TW.md');
  if (errors.length > 0) return { errors, warnings, bootstrapped: false, specs: 0, requirements: 0 };

  const englishIds = matches(read(englishPath), PD_ID);
  const chineseIds = matches(read(chinesePath), PD_ID);
  for (const id of duplicates(englishIds)) errors.push(`Duplicate English objective ID: ${id}`);
  for (const id of duplicates(chineseIds)) errors.push(`Duplicate zh-TW objective ID: ${id}`);

  const englishSet = new Set(englishIds);
  const chineseSet = new Set(chineseIds);
  const specFiles = listMarkdownFiles(specsDirectory);
  const bootstrapped = englishSet.size > 0 || chineseSet.size > 0;

  if (!bootstrapped) {
    if (specFiles.length > 0) errors.push('Current product specs exist before Product Direction objective bootstrap');
    else warnings.push('Objective bootstrap is pending; no current product specs were validated');
    return { errors, warnings, bootstrapped: false, specs: 0, requirements: 0 };
  }

  for (const id of [...englishSet].filter((id) => !chineseSet.has(id)).sort()) {
    errors.push(`Objective ID missing from zh-TW Product Direction: ${id}`);
  }
  for (const id of [...chineseSet].filter((id) => !englishSet.has(id)).sort()) {
    errors.push(`Objective ID missing from English Product Direction: ${id}`);
  }

  const allRequirementIds = [];
  let requirementCount = 0;
  for (const file of specFiles) {
    const label = relative(repoRoot, file);
    const text = read(file);
    const frontmatter = parseFrontmatter(text);
    if (!frontmatter) {
      errors.push(`${label}: missing or malformed YAML frontmatter`);
      continue;
    }
    if (!frontmatter.capability || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.capability)) {
      errors.push(`${label}: capability must be a non-empty kebab-case slug`);
    }
    if (!frontmatter.title) errors.push(`${label}: missing title`);
    if (frontmatter.status !== 'current') errors.push(`${label}: status must be current`);
    if (frontmatter.directionObjectives.length === 0) errors.push(`${label}: direction_objectives must not be empty`);
    for (const id of frontmatter.directionObjectives) {
      if (!englishSet.has(id)) errors.push(`${label}: unknown direction objective ${id}`);
    }
    for (const heading of REQUIRED_HEADINGS) {
      if (!frontmatter.body.includes(heading)) errors.push(`${label}: missing heading ${heading}`);
    }

    const headings = [...frontmatter.body.matchAll(REQ_HEADING)];
    if (headings.length === 0) errors.push(`${label}: no requirement headings found`);
    for (let index = 0; index < headings.length; index += 1) {
      const match = headings[index];
      const id = match[1];
      const start = match.index;
      const end = headings[index + 1]?.index ?? frontmatter.body.length;
      const section = frontmatter.body.slice(start, end);
      allRequirementIds.push(id);
      requirementCount += 1;

      if (!/\b(?:MUST|MUST NOT|SHALL|SHALL NOT)\b/.test(section)) {
        errors.push(`${label} ${id}: missing normative MUST/SHALL statement`);
      }
      if (!/^#### Scenario: .+$/m.test(section)) errors.push(`${label} ${id}: missing Scenario heading`);
      for (const keyword of ['GIVEN', 'WHEN', 'THEN']) {
        if (!new RegExp(`^- ${keyword}\\b`, 'm').test(section)) errors.push(`${label} ${id}: missing ${keyword} step`);
      }
      if (!section.includes('##### Evidence')) errors.push(`${label} ${id}: missing Evidence heading`);

      const ownerMatches = [...section.matchAll(/^- Owner: `([^`]+)`\s*$/gm)];
      if (ownerMatches.length === 0) errors.push(`${label} ${id}: missing Owner evidence path`);
      const verificationMatches = [...section.matchAll(/^- Verification: `([^`]+)` — `([^`]+)`\s*$/gm)];
      const gapMatches = [...section.matchAll(/^- Verification: gap — (.+)$/gm)];
      if (verificationMatches.length === 0 && gapMatches.length === 0) {
        errors.push(`${label} ${id}: missing Verification path or explicit gap`);
      }

      for (const evidence of [...ownerMatches, ...verificationMatches]) {
        const candidate = evidence[1];
        const resolved = safeEvidencePath(repoRoot, candidate);
        if (!resolved) errors.push(`${label} ${id}: unsafe evidence path ${candidate}`);
        else if (!existsSync(resolved)) errors.push(`${label} ${id}: evidence path does not exist: ${candidate}`);
      }
    }
  }

  for (const id of duplicates(allRequirementIds)) errors.push(`Duplicate requirement ID: ${id}`);
  return { errors, warnings, bootstrapped: true, specs: specFiles.length, requirements: requirementCount };
}

function writeFixture(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function runSelfTest() {
  const root = mkdtempSync(join(tmpdir(), 'advance-product-spec-'));
  try {
    const id = 'PD-CAP-COMP-PRODUCT-001';
    writeFixture(root, 'docs/PRODUCT-DIRECTION.md', `<!-- ${id} -->\nRequirement\n`);
    writeFixture(root, 'docs/PRODUCT-DIRECTION.zh-TW.md', `<!-- ${id} -->\n需求\n`);
    writeFixture(root, 'packages/core/src/example.ts', 'export const example = true;\n');
    writeFixture(root, 'packages/core/test/example.test.ts', 'test("example", () => {});\n');
    writeFixture(root, 'docs/product-specs/sprite-composition.md', `---
capability: sprite-composition
title: Sprite Composition
status: current
direction_objectives:
  - ${id}
---

# Sprite Composition

## Purpose
Purpose.

## Scope

### Supported
Supported.

### Excluded
Excluded.

## Requirements

### REQ-COMP-001 — Render

The system MUST render.

#### Scenario: Render

- GIVEN a selection
- WHEN render runs
- THEN output exists

##### Evidence

- Owner: \`packages/core/src/example.ts\`
- Verification: \`packages/core/test/example.test.ts\` — \`example\`
`);
    const valid = validateRepository(root);
    if (valid.errors.length > 0) throw new Error(`valid fixture failed: ${valid.errors.join('; ')}`);

    writeFixture(root, 'docs/product-specs/sprite-composition.md', read(join(root, 'docs/product-specs/sprite-composition.md')).replace('packages/core/test/example.test.ts', '../escape.test.ts'));
    const invalid = validateRepository(root);
    if (!invalid.errors.some((error) => error.includes('unsafe evidence path'))) {
      throw new Error(`invalid fixture did not report unsafe path: ${invalid.errors.join('; ')}`);
    }
    process.stdout.write('PASS validator self-test\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
if (args.selfTest) {
  runSelfTest();
} else {
  const result = validateRepository(args.root);
  for (const warning of result.warnings) process.stdout.write(`WARN ${warning}\n`);
  for (const error of result.errors) process.stderr.write(`ERROR ${error}\n`);
  process.stdout.write(`Checked ${result.specs} current spec(s), ${result.requirements} requirement(s); bootstrap=${result.bootstrapped ? 'ready' : 'pending'}\n`);
  if (result.errors.length > 0) process.exitCode = 1;
  else process.stdout.write('PASS product spec structure\n');
}
