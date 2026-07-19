import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUDIT_CATEGORIES = Object.freeze([
  'unsupported', 'missingFiles', 'blankFrames', 'errors',
]);
const VIEWS = new Set(['summary', 'types', 'findings', 'worklist']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VIEW_OPTIONS = Object.freeze({
  summary: new Set(['view']),
  types: new Set(['view']),
  findings: new Set(['view', 'category', 'itemId', 'limit', 'offset']),
  worklist: new Set(['view', 'itemId', 'limit', 'offset']),
});
const VIEW_FLAGS = Object.freeze({
  summary: new Set(),
  types: new Set(),
  findings: new Set(['--category', '--item', '--limit', '--offset']),
  worklist: new Set(['--item', '--limit', '--offset']),
});
const INSPECTION_ERROR_KINDS = new Set([
  'asset_read_failed',
  'image_decode_failed',
  'path_resolution_requires_selection',
]);

const isRecord = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value);
const isString = (value) => typeof value === 'string';
const isStringArray = (value) => Array.isArray(value) && value.every(isString);
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

function hasOptionalString(record, key) {
  return record[key] === undefined || isString(record[key]);
}

function isConsumer(value) {
  return isRecord(value)
    && isString(value.itemId)
    && isString(value.typeName)
    && isString(value.layer)
    && isStringArray(value.bodyTypes)
    && hasOptionalString(value, 'variant')
    && isStringArray(value.recolors);
}

function isRequirement(value) {
  if (!isConsumer(value)
    || !['inferred', 'manual-review'].includes(value.pathConfidence)
    || !hasOptionalString(value, 'expectedPath')
    || !hasOptionalString(value, 'manualReviewReason')) return false;
  return value.pathConfidence === 'inferred'
    ? isString(value.expectedPath)
    : isString(value.manualReviewReason);
}

function isUnsupportedFinding(value) {
  return isRecord(value)
    && isString(value.itemId)
    && isString(value.typeName)
    && isString(value.animation)
    && isStringArray(value.nativeAnimations)
    && isStringArray(value.compatibleAnimations)
    && Array.isArray(value.requirements)
    && value.requirements.every(isRequirement);
}

function isPhysicalFinding(value) {
  return isRecord(value)
    && isString(value.path)
    && isString(value.animation)
    && isString(value.sourceAnimation)
    && Array.isArray(value.consumers)
    && value.consumers.every(isConsumer);
}

function isBlankFrame(value) {
  return isRecord(value)
    && isNonNegativeInteger(value.sourceColumn)
    && Array.isArray(value.logicalFrameIndices)
    && value.logicalFrameIndices.every(isNonNegativeInteger);
}

function isBlankFramesFinding(value) {
  return isPhysicalFinding(value)
    && isNonNegativeInteger(value.sourceRow)
    && hasOptionalString(value, 'direction')
    && Array.isArray(value.frames)
    && value.frames.every(isBlankFrame);
}

function isInspectionError(value) {
  return isRecord(value)
    && INSPECTION_ERROR_KINDS.has(value.kind)
    && isString(value.message)
    && hasOptionalString(value, 'path')
    && Array.isArray(value.consumers)
    && value.consumers.every(isConsumer);
}

function isSummary(value) {
  return isRecord(value) && [
    'itemsScanned',
    'incompleteItems',
    'unsupported',
    'missingFiles',
    'blankFrames',
    'errors',
  ].every((key) => isNonNegativeInteger(value[key]));
}

function isScope(value) {
  return isRecord(value)
    && hasOptionalString(value, 'typeName')
    && hasOptionalString(value, 'bodyType');
}

function failure(code, message, view = null, issuePath) {
  return {
    ok: false,
    view,
    report: null,
    page: null,
    data: null,
    errors: [{ code, message, ...(issuePath ? { path: issuePath } : {}) }],
  };
}

function validateReport(report, view) {
  if (!isRecord(report) || report.ok !== true
    || report.command !== 'catalog audit-animations'
    || !isRecord(report.data) || !isSummary(report.data.summary)
    || !isStringArray(report.data.targets)
    || !isScope(report.data.scope)
    || !Array.isArray(report.data.unsupported)
    || !report.data.unsupported.every(isUnsupportedFinding)
    || !Array.isArray(report.data.missingFiles)
    || !report.data.missingFiles.every(isPhysicalFinding)
    || !Array.isArray(report.data.blankFrames)
    || !report.data.blankFrames.every(isBlankFramesFinding)
    || !Array.isArray(report.data.errors)
    || !report.data.errors.every(isInspectionError)
    || !Array.isArray(report.errors) || report.errors.length !== 0) {
    return failure(
      'report_shape_invalid',
      'Expected a successful catalog audit-animations JSON response.',
      view,
    );
  }
  return undefined;
}

function validateOptions(options) {
  if (!isRecord(options)) {
    return failure('helper_usage_invalid', 'Report options must be an object.');
  }
  const view = options.view ?? null;
  if (!VIEWS.has(view)) {
    return failure('helper_usage_invalid', `Unknown report view: ${view ?? '(missing)'}.`, view);
  }
  const unsupported = Object.keys(options).find((key) => !VIEW_OPTIONS[view].has(key));
  if (unsupported) {
    return failure(
      'helper_usage_invalid',
      `Option ${unsupported} is not supported for the ${view} view.`,
      view,
    );
  }
  if (view === 'findings' && !AUDIT_CATEGORIES.includes(options.category)) {
    return failure('category_invalid', `Unknown finding category: ${options.category ?? '(missing)'}.`, view);
  }
  if (options.itemId !== undefined && !isString(options.itemId)) {
    return failure('helper_usage_invalid', 'Item must be a string.', view);
  }
  if (view === 'findings' || view === 'worklist') {
    const limit = options.limit ?? DEFAULT_LIMIT;
    const offset = options.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT
      || !Number.isInteger(offset) || offset < 0) {
      return failure('pagination_invalid', 'Limit must be 1-100 and offset must be a non-negative integer.', view);
    }
  }
  return undefined;
}

function itemIds(finding, category) {
  if (category === 'unsupported') return [finding.itemId];
  return Array.isArray(finding.consumers)
    ? finding.consumers.map(({ itemId }) => itemId)
    : [];
}

function page(entries, limit, offset) {
  const data = entries.slice(offset, offset + limit);
  const nextOffset = offset + data.length;
  return {
    data,
    page: {
      limit,
      offset,
      returned: data.length,
      total: entries.length,
      hasMore: nextOffset < entries.length,
      nextOffset: nextOffset < entries.length ? nextOffset : null,
    },
  };
}

function reportHeader(data) {
  return { targets: data.targets, scope: data.scope, summary: data.summary };
}

export function projectAuditReport(report, options = {}) {
  const invalidOptions = validateOptions(options);
  if (invalidOptions) return invalidOptions;
  const { view } = options;
  const invalid = validateReport(report, view);
  if (invalid) return invalid;
  const header = reportHeader(report.data);
  if (view === 'summary') {
    return { ok: true, view, report: header, page: null, data: header, errors: [] };
  }
  if (view === 'types') {
    const incomplete = new Map();
    for (const category of AUDIT_CATEGORIES.slice(0, 3)) {
      for (const finding of report.data[category]) {
        const consumers = category === 'unsupported'
          ? [{ itemId: finding.itemId, typeName: finding.typeName }]
          : finding.consumers;
        for (const consumer of consumers) {
          if (!incomplete.has(consumer.itemId)) {
            incomplete.set(consumer.itemId, consumer.typeName);
          }
        }
      }
    }
    const counts = new Map();
    for (const typeName of incomplete.values()) {
      counts.set(typeName, (counts.get(typeName) ?? 0) + 1);
    }
    const data = [...counts].map(([typeName, count]) => ({ typeName, count }));
    return { ok: true, view, report: header, page: null, data, errors: [] };
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;
  const categoryEntries = view === 'findings'
    ? report.data[options.category].map((finding) => ({
        category: options.category, finding,
      }))
    : AUDIT_CATEGORIES.flatMap((category) => report.data[category].map((finding) => ({
        category, finding,
      })));
  const filtered = options.itemId === undefined
    ? categoryEntries
    : categoryEntries.filter(({ category, finding }) => (
        itemIds(finding, category).includes(options.itemId)
      ));
  const projected = page(filtered, limit, offset);
  const data = view === 'findings'
    ? projected.data.map(({ finding }) => finding)
    : projected.data;
  return { ok: true, view, report: header, page: projected.page, data, errors: [] };
}

function parseReaderArgs(argv) {
  const [reportPath, view, ...flags] = argv;
  if (!reportPath || !view || flags.length % 2 !== 0) {
    return failure(
      'helper_usage_invalid',
      'Usage: read-audit-report.mjs <report.json> <summary|types|findings|worklist> [options].',
      view ?? null,
    );
  }
  if (!VIEWS.has(view)) {
    return failure('helper_usage_invalid', `Unknown report view: ${view}.`, view);
  }
  const options = { view };
  const seen = new Set();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (!['--category', '--item', '--limit', '--offset'].includes(flag)
      || value === undefined || seen.has(flag)) {
      return failure('helper_usage_invalid', `Invalid or repeated option: ${flag}.`, view);
    }
    if (!VIEW_FLAGS[view].has(flag)) {
      return failure('helper_usage_invalid', `Option ${flag} is not supported for the ${view} view.`, view);
    }
    seen.add(flag);
    if (flag === '--category') options.category = value;
    if (flag === '--item') options.itemId = value;
    if (flag === '--limit' || flag === '--offset') {
      if (!/^\d+$/u.test(value)) {
        return failure('pagination_invalid', `${flag} must be an integer.`, view);
      }
      options[flag === '--limit' ? 'limit' : 'offset'] = Number(value);
    }
  }
  const invalidOptions = validateOptions(options);
  if (invalidOptions) return invalidOptions;
  return { reportPath, options };
}

export function runAuditReportReader(argv, {
  readFile = readFileSync,
  stdout = (text) => process.stdout.write(text),
} = {}) {
  const parsed = parseReaderArgs(argv);
  let result;
  if (!parsed.reportPath) {
    result = parsed;
  } else {
    let source;
    try {
      source = readFile(parsed.reportPath, 'utf8');
    } catch (error) {
      result = failure(
        'report_read_failed',
        error instanceof Error ? error.message : String(error),
        parsed.options.view,
        parsed.reportPath,
      );
    }
    if (!result) {
      let report;
      try {
        report = JSON.parse(source);
      } catch (error) {
        result = failure(
          'report_json_invalid',
          error instanceof Error ? error.message : String(error),
          parsed.options.view,
          parsed.reportPath,
        );
      }
      if (!result) result = projectAuditReport(report, parsed.options);
    }
  }
  stdout(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}

if (process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = runAuditReportReader(process.argv.slice(2));
}
