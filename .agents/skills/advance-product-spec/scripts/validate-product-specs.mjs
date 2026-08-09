#!/usr/bin/env node

import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const PD_ID = /\bPD-(?:CAP|GRD|DEL|EVO|OPT)-[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g;
const OBJECTIVE_HEADING = /^## (PD-(?:CAP|GRD|DEL|EVO|OPT)-[A-Z0-9]+(?:-[A-Z0-9]+)+) — (.+)$/gm;
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

function markdownSections(text) {
  const headings = [...text.matchAll(/^(#{1,6})\s+(.+)$/gm)];
  const sections = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const level = heading[1].length;
    const next = headings.slice(index + 1).find((candidate) => candidate[1].length <= level);
    const title = heading[2].trim();
    const values = sections.get(title) ?? [];
    values.push(text.slice(heading.index + heading[0].length, next?.index ?? text.length));
    sections.set(title, values);
  }
  return sections;
}

function parseObjectiveEntries(text) {
  const headings = [...text.matchAll(OBJECTIVE_HEADING)];
  return headings.map((match, index) => ({
    id: match[1],
    title: match[2].trim(),
    section: text.slice(match.index, headings[index + 1]?.index ?? text.length),
  }));
}

function normalizeProse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function occurrenceCount(text, excerpt) {
  let count = 0;
  let offset = 0;
  while (offset <= text.length) {
    const index = text.indexOf(excerpt, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + excerpt.length;
  }
  return count;
}

function validateSourceLocator(entry, field, sections, label, errors) {
  const pattern = new RegExp('^- ' + field + ': (.+)\\s*$', 'gm');
  const locators = [...entry.section.matchAll(pattern)].map((match) => match[1].trim());
  if (locators.length !== 1) {
    errors.push(`${label} ${entry.id}: expected exactly one ${field} locator`);
    return;
  }
  const separator = locators[0].indexOf(' > ');
  if (separator < 1 || separator === locators[0].length - 3) {
    errors.push(`${label} ${entry.id}: ${field} must use "Heading > Exact source excerpt"`);
    return;
  }
  const rootHeading = locators[0].slice(0, separator).trim();
  const excerpt = normalizeProse(locators[0].slice(separator + 3));
  const matchingSections = sections.get(rootHeading);
  if (!matchingSections) {
    errors.push(`${label} ${entry.id}: ${field} root heading does not exist: ${rootHeading}`);
    return;
  }
  const count = matchingSections.reduce(
    (total, section) => total + occurrenceCount(normalizeProse(section), excerpt),
    0,
  );
  if (count === 0) {
    errors.push(`${label} ${entry.id}: ${field} excerpt does not match its Product Direction section`);
  } else if (count > 1) {
    errors.push(`${label} ${entry.id}: ${field} excerpt is not unique within its Product Direction section`);
  }
}

function validateRepository(repoRoot) {
  const errors = [];
  const warnings = [];
  const englishPath = join(repoRoot, 'docs', 'PRODUCT-DIRECTION.md');
  const chinesePath = join(repoRoot, 'docs', 'PRODUCT-DIRECTION.zh-TW.md');
  const objectivesPath = join(repoRoot, 'docs', 'PRODUCT-OBJECTIVES.md');
  const specsDirectory = join(repoRoot, 'docs', 'product-specs');

  if (!existsSync(englishPath)) errors.push('Missing docs/PRODUCT-DIRECTION.md');
  if (!existsSync(chinesePath)) errors.push('Missing docs/PRODUCT-DIRECTION.zh-TW.md');
  if (errors.length > 0) return { errors, warnings, bootstrapped: false, objectives: 0, specs: 0, requirements: 0 };

  const englishText = read(englishPath);
  const chineseText = read(chinesePath);
  const englishIds = matches(englishText, PD_ID);
  const chineseIds = matches(chineseText, PD_ID);
  if (englishIds.length > 0) errors.push('English Product Direction must not contain objective IDs; move them to docs/PRODUCT-OBJECTIVES.md');
  if (chineseIds.length > 0) errors.push('zh-TW Product Direction must not contain objective IDs; move them to docs/PRODUCT-OBJECTIVES.md');

  const specFiles = listMarkdownFiles(specsDirectory);
  if (!existsSync(objectivesPath)) {
    if (specFiles.length > 0) errors.push('Current product specs exist before Product Direction objective bootstrap');
    else warnings.push('Objective bootstrap is pending; no current product specs were validated');
    return { errors, warnings, bootstrapped: false, objectives: 0, specs: 0, requirements: 0 };
  }

  const objectivesText = read(objectivesPath);
  const objectiveIds = matches(objectivesText, PD_ID);
  for (const id of duplicates(objectiveIds)) errors.push(`Duplicate objective ID in docs/PRODUCT-OBJECTIVES.md: ${id}`);

  const objectiveEntries = parseObjectiveEntries(objectivesText);
  const entryIds = objectiveEntries.map((entry) => entry.id);
  for (const id of duplicates(entryIds)) errors.push(`Duplicate objective entry heading: ${id}`);
  const entrySet = new Set(entryIds);
  for (const id of new Set(objectiveIds)) {
    if (!entrySet.has(id)) errors.push(`Objective ID must be declared by a register entry heading: ${id}`);
  }

  const bootstrapped = objectiveEntries.length > 0;
  if (!bootstrapped) {
    if (specFiles.length > 0) errors.push('Current product specs exist before Product Direction objective bootstrap');
    else warnings.push('Objective bootstrap is pending; the standalone register has no objective entries');
    return { errors, warnings, bootstrapped: false, objectives: 0, specs: 0, requirements: 0 };
  }

  const englishSections = markdownSections(englishText);
  for (const entry of objectiveEntries) {
    const label = 'docs/PRODUCT-OBJECTIVES.md';
    validateSourceLocator(entry, 'English source', englishSections, label, errors);
    if (/^- (?!English source:)[^:\n]+ source:/m.test(entry.section)) {
      errors.push(`${label} ${entry.id}: non-English source locators are not allowed; keep the register English-only`);
    }
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
      if (!entrySet.has(id)) errors.push(`${label}: unknown direction objective ${id}`);
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
  return { errors, warnings, bootstrapped: true, objectives: objectiveEntries.length, specs: specFiles.length, requirements: requirementCount };
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
    writeFixture(root, 'docs/PRODUCT-DIRECTION.md', '# Product Direction\n\n## Sprite composition\n\nRequirement\n');
    writeFixture(root, 'docs/PRODUCT-DIRECTION.zh-TW.md', '# 產品方向\n\n## 精靈圖合成\n\n需求\n');
    const register = `# Product Objective Register

## ${id} — Render a character

- English source: Sprite composition > Requirement
`;
    writeFixture(root, 'docs/PRODUCT-OBJECTIVES.md', register);
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

    writeFixture(root, 'docs/PRODUCT-OBJECTIVES.md', register.replace('Sprite composition > Requirement', 'Sprite composition > Missing excerpt'));
    const missingExcerpt = validateRepository(root);
    if (!missingExcerpt.errors.some((error) => error.includes('excerpt does not match'))) {
      throw new Error(`missing source excerpt fixture did not fail: ${missingExcerpt.errors.join('; ')}`);
    }

    writeFixture(root, 'docs/PRODUCT-OBJECTIVES.md', register.replace('Sprite composition > Requirement', 'Missing heading > Requirement'));
    const missingHeading = validateRepository(root);
    if (!missingHeading.errors.some((error) => error.includes('root heading does not exist'))) {
      throw new Error(`missing source heading fixture did not fail: ${missingHeading.errors.join('; ')}`);
    }

    writeFixture(root, 'docs/PRODUCT-OBJECTIVES.md', register.replace(
      '- English source: Sprite composition > Requirement',
      '- English source: Sprite composition > Requirement\n- zh-TW source: 精靈圖合成 > 需求',
    ));
    const translatedLocator = validateRepository(root);
    if (!translatedLocator.errors.some((error) => error.includes('keep the register English-only'))) {
      throw new Error(`translated source locator fixture did not fail: ${translatedLocator.errors.join('; ')}`);
    }

    writeFixture(root, 'docs/PRODUCT-OBJECTIVES.md', register);
    writeFixture(root, 'docs/PRODUCT-DIRECTION.md', `<!-- ${id} -->\n# Product Direction\n\n## Sprite composition\n\nRequirement\n`);
    const embedded = validateRepository(root);
    if (!embedded.errors.some((error) => error.includes('must not contain objective IDs'))) {
      throw new Error(`embedded objective ID fixture did not fail: ${embedded.errors.join('; ')}`);
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
  process.stdout.write(`Checked ${result.objectives} objective(s), ${result.specs} current spec(s), ${result.requirements} requirement(s); bootstrap=${result.bootstrapped ? 'ready' : 'pending'}\n`);
  if (result.errors.length > 0) process.exitCode = 1;
  else process.stdout.write('PASS product spec structure\n');
}
