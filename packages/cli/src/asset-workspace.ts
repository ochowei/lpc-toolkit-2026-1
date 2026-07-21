import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ASSET_WORKSPACE_SCHEMA = 'lpc-toolkit.asset-workspace.v1' as const;
export const ASSET_WORKSPACE_REGISTRY_SCHEMA =
  'lpc-toolkit.asset-workspace-registry.v1' as const;
export const ASSET_OUTPUT_MARKER_SCHEMA = 'lpc-toolkit.asset-output.v1' as const;

const WORKSPACE_CONFIG_FILE = 'lpc-asset-workspace.json';
const OUTPUT_MARKER_FILE = '.lpc-toolkit-managed.json';
const DEFAULT_PACKS_DIRECTORY = 'artist-packs';
const DEFAULT_OUTPUT_DIRECTORY = 'assets_custom';
const DEFAULT_STATE_DIRECTORY = '.lpc-toolkit/asset-packs';

export interface AssetWorkspace {
  readonly root: string;
  readonly configPath: string;
  readonly packsRoot: string;
  readonly outputRoot: string;
  readonly stateRoot: string;
  readonly registryPath: string;
}

interface AssetWorkspaceConfig {
  readonly schema: typeof ASSET_WORKSPACE_SCHEMA;
  readonly packsDirectory: string;
  readonly outputDirectory: string;
  readonly stateDirectory: string;
}

interface AssetOutputMarker {
  readonly schema: typeof ASSET_OUTPUT_MARKER_SCHEMA;
  readonly workspaceId: string;
}

const WORKSPACE_CONFIG_KEYS = [
  'schema',
  'packsDirectory',
  'outputDirectory',
  'stateDirectory',
] as const;

const OUTPUT_MARKER_KEYS = ['schema', 'workspaceId'] as const;

class AssetWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetWorkspaceError';
  }
}

class WorkspaceConfigNotFoundError extends AssetWorkspaceError {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceConfigNotFoundError';
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AssetWorkspaceError('Asset workspace config must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  message: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AssetWorkspaceError(message);
  }
  return value;
}

function assertExactKeys(
  record: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const expected = new Set(expectedKeys);
  const unknownKeys = Object.keys(record).filter((key) => !expected.has(key));
  if (unknownKeys.length > 0) {
    throw new AssetWorkspaceError(
      `${label} contains unknown keys: ${unknownKeys.join(', ')}`,
    );
  }
}

function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function isAllowedRootAliasSymlink(target: string): boolean {
  if (process.platform !== 'darwin') return false;
  if (path.dirname(target) !== path.parse(target).root) return false;

  try {
    return realpathSync.native(target) === path.join('/private', path.basename(target));
  } catch {
    return false;
  }
}

function assertExistingDirectoryPath(target: string): void {
  const absoluteTarget = path.resolve(target);
  let current = absoluteTarget;

  while (true) {
    if (existsSync(current)) {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) {
        if (!isAllowedRootAliasSymlink(current)) {
          throw new AssetWorkspaceError(
            `Refusing to initialize through a symlinked workspace path: ${current}`,
          );
        }
      } else if (!stats.isDirectory()) {
        throw new AssetWorkspaceError(`Workspace path is not a directory: ${current}`);
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function assertSafeWorkspaceRoot(root: string): string {
  const absoluteRoot = path.resolve(root);
  assertExistingDirectoryPath(absoluteRoot);
  return absoluteRoot;
}

function ensureWorkspaceRoot(root: string): void {
  const absoluteRoot = assertSafeWorkspaceRoot(root);
  mkdirSync(absoluteRoot, { recursive: true });
}

function ensureDirectoryUnderRoot(root: string, subpath: string): void {
  const absoluteRoot = assertSafeWorkspaceRoot(root);
  const absolutePath = path.resolve(absoluteRoot, subpath);
  if (!isInsideRoot(absoluteRoot, absolutePath)) {
    throw new AssetWorkspaceError(
      `Asset workspace path escapes the workspace root: ${subpath}`,
    );
  }

  const relative = path.relative(absoluteRoot, absolutePath);
  if (relative === '') return;

  let current = absoluteRoot;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    if (!existsSync(current)) {
      mkdirSync(current);
      continue;
    }
    const stats = lstatSync(current);
    if (stats.isSymbolicLink()) {
      throw new AssetWorkspaceError(
        `Refusing to initialize through a symlinked workspace path: ${current}`,
      );
    }
    if (!stats.isDirectory()) {
      throw new AssetWorkspaceError(
        `Workspace path is not a directory: ${current}`,
      );
    }
  }
}

function assertSafeExistingSubpath(root: string, subpath: string): void {
  const absoluteRoot = assertSafeWorkspaceRoot(root);
  const absolutePath = path.resolve(absoluteRoot, subpath);
  if (!isInsideRoot(absoluteRoot, absolutePath)) {
    throw new AssetWorkspaceError(
      `Asset workspace path escapes the workspace root: ${subpath}`,
    );
  }
  assertExistingDirectoryPath(absolutePath);
}

function resolveConfiguredDirectory(root: string, configuredPath: string): string {
  if (path.isAbsolute(configuredPath)) {
    throw new AssetWorkspaceError(
      `Asset workspace path escapes the workspace root: ${configuredPath}`,
    );
  }
  const absoluteRoot = assertSafeWorkspaceRoot(root);
  const resolved = path.resolve(absoluteRoot, configuredPath);
  if (!isInsideRoot(absoluteRoot, resolved)) {
    throw new AssetWorkspaceError(
      `Asset workspace path escapes the workspace root: ${configuredPath}`,
    );
  }
  assertExistingDirectoryPath(resolved);
  return resolved;
}

function createWorkspace(root: string, config: AssetWorkspaceConfig): AssetWorkspace {
  const absoluteRoot = assertSafeWorkspaceRoot(root);
  const packsRoot = resolveConfiguredDirectory(absoluteRoot, config.packsDirectory);
  const outputRoot = resolveConfiguredDirectory(absoluteRoot, config.outputDirectory);
  const stateRoot = resolveConfiguredDirectory(absoluteRoot, config.stateDirectory);

  return {
    root: absoluteRoot,
    configPath: path.join(absoluteRoot, WORKSPACE_CONFIG_FILE),
    packsRoot,
    outputRoot,
    stateRoot,
    registryPath: path.join(stateRoot, 'registry.json'),
  };
}

function readWorkspaceConfig(root: string, explicit: boolean): AssetWorkspaceConfig {
  const configPath = path.join(path.resolve(root), WORKSPACE_CONFIG_FILE);
  if (!existsSync(configPath)) {
    if (explicit) {
      throw new WorkspaceConfigNotFoundError(
        `Asset workspace config not found at explicit path: ${path.resolve(root)}`,
      );
    }
    throw new WorkspaceConfigNotFoundError(
      `Asset workspace config not found at ${path.resolve(root)}`,
    );
  }

  const record = asObject(readJsonFile(configPath));
  assertExactKeys(record, WORKSPACE_CONFIG_KEYS, 'Asset workspace config');
  const schema = requireString(
    record,
    'schema',
    'Asset workspace config must include a string schema.',
  );
  if (schema !== ASSET_WORKSPACE_SCHEMA) {
    throw new AssetWorkspaceError(`Unknown asset workspace schema: ${schema}`);
  }

  return {
    schema: ASSET_WORKSPACE_SCHEMA,
    packsDirectory: requireString(
      record,
      'packsDirectory',
      'Asset workspace config must include a string packsDirectory.',
    ),
    outputDirectory: requireString(
      record,
      'outputDirectory',
      'Asset workspace config must include a string outputDirectory.',
    ),
    stateDirectory: requireString(
      record,
      'stateDirectory',
      'Asset workspace config must include a string stateDirectory.',
    ),
  };
}

function readOutputMarker(outputRoot: string): AssetOutputMarker | undefined {
  const markerPath = path.join(outputRoot, OUTPUT_MARKER_FILE);
  if (!existsSync(markerPath)) return undefined;

  const record = asObject(readJsonFile(markerPath));
  assertExactKeys(record, OUTPUT_MARKER_KEYS, 'Asset output marker');
  const schema = requireString(
    record,
    'schema',
    'Asset output marker must include a string schema.',
  );
  if (schema !== ASSET_OUTPUT_MARKER_SCHEMA) {
    throw new AssetWorkspaceError(`Unknown asset output marker schema: ${schema}`);
  }

  return {
    schema: ASSET_OUTPUT_MARKER_SCHEMA,
    workspaceId: requireString(
      record,
      'workspaceId',
      'Asset output marker must include a string workspaceId.',
    ),
  };
}

function writeWorkspaceConfig(root: string): void {
  writeFileSync(
    path.join(root, WORKSPACE_CONFIG_FILE),
    `${JSON.stringify(
      {
        schema: ASSET_WORKSPACE_SCHEMA,
        packsDirectory: DEFAULT_PACKS_DIRECTORY,
        outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
        stateDirectory: DEFAULT_STATE_DIRECTORY,
      },
      null,
      2,
    )}\n`,
  );
}

function writeOutputMarker(outputRoot: string): void {
  writeFileSync(
    path.join(outputRoot, OUTPUT_MARKER_FILE),
    `${JSON.stringify(
      {
        schema: ASSET_OUTPUT_MARKER_SCHEMA,
        workspaceId: randomUUID(),
      },
      null,
      2,
    )}\n`,
  );
}

function assertOutputOwnershipCanBeInitialized(outputRoot: string): void {
  if (!existsSync(outputRoot)) return;
  const marker = readOutputMarker(outputRoot);
  if (marker !== undefined) return;
  const entries = readdirSync(outputRoot);
  if (entries.length > 0) {
    throw new AssetWorkspaceError(
      `Refusing to adopt non-empty unowned asset output: ${outputRoot}`,
    );
  }
}

function defaultWorkspace(root: string): AssetWorkspace {
  return createWorkspace(root, {
    schema: ASSET_WORKSPACE_SCHEMA,
    packsDirectory: DEFAULT_PACKS_DIRECTORY,
    outputDirectory: DEFAULT_OUTPUT_DIRECTORY,
    stateDirectory: DEFAULT_STATE_DIRECTORY,
  });
}

export function findAssetWorkspace(start: string, explicit?: string): AssetWorkspace {
  const absoluteStart = path.resolve(start);
  if (explicit !== undefined) {
    return createWorkspace(
      path.resolve(absoluteStart, explicit),
      readWorkspaceConfig(path.resolve(absoluteStart, explicit), true),
    );
  }

  let current = absoluteStart;
  while (true) {
    try {
      return createWorkspace(current, readWorkspaceConfig(current, false));
    } catch (error) {
      if (!(error instanceof WorkspaceConfigNotFoundError)) throw error;
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new AssetWorkspaceError(`Asset workspace not found from ${absoluteStart}`);
}

export function initializeAssetWorkspace(target: string): AssetWorkspace {
  const root = path.resolve(target);
  const configPath = path.join(root, WORKSPACE_CONFIG_FILE);
  if (existsSync(configPath)) {
    const workspace = createWorkspace(root, readWorkspaceConfig(root, false));
    assertManagedAssetOutput(workspace);
    return workspace;
  }

  const workspace = defaultWorkspace(root);
  ensureWorkspaceRoot(root);
  assertSafeExistingSubpath(root, DEFAULT_PACKS_DIRECTORY);
  assertSafeExistingSubpath(root, DEFAULT_OUTPUT_DIRECTORY);
  assertSafeExistingSubpath(root, DEFAULT_STATE_DIRECTORY);
  assertOutputOwnershipCanBeInitialized(workspace.outputRoot);

  ensureDirectoryUnderRoot(root, path.relative(root, workspace.packsRoot));
  ensureDirectoryUnderRoot(root, path.relative(root, workspace.outputRoot));
  ensureDirectoryUnderRoot(root, path.relative(root, workspace.stateRoot));
  ensureDirectoryUnderRoot(
    root,
    path.relative(root, path.join(workspace.stateRoot, 'installed')),
  );
  ensureDirectoryUnderRoot(
    root,
    path.relative(root, path.join(workspace.stateRoot, 'validation')),
  );
  ensureDirectoryUnderRoot(
    root,
    path.relative(root, path.join(workspace.stateRoot, 'staging')),
  );

  if (!existsSync(configPath)) writeWorkspaceConfig(root);
  if (!existsSync(path.join(workspace.outputRoot, OUTPUT_MARKER_FILE))) {
    writeOutputMarker(workspace.outputRoot);
  }

  return workspace;
}

export function assertManagedAssetOutput(workspace: AssetWorkspace): void {
  assertSafeExistingSubpath(workspace.root, path.relative(workspace.root, workspace.outputRoot));
  if (!existsSync(workspace.outputRoot) || !lstatSync(workspace.outputRoot).isDirectory()) {
    throw new AssetWorkspaceError(
      `Managed asset output directory does not exist: ${workspace.outputRoot}`,
    );
  }
  const marker = readOutputMarker(workspace.outputRoot);
  if (marker === undefined) {
    throw new AssetWorkspaceError(
      `Managed asset output marker not found: ${workspace.outputRoot}`,
    );
  }
}
