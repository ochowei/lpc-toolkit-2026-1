import type { ParsedArgs } from './args.js';
import { editDistance } from './catalog-discovery.js';
import type { CliIssue } from './response.js';

type OptionKind = 'boolean' | 'value' | 'repeatable';

interface CommandOptionSpec {
  readonly name: string;
  readonly kind: OptionKind;
  readonly valueLabel?: string;
  readonly allowedValues?: readonly string[];
  readonly description: string;
}

interface CommandSpec {
  readonly command: readonly string[];
  readonly usage: string;
  readonly description: string;
  readonly options: readonly CommandOptionSpec[];
  readonly examples: readonly string[];
}

const HELP_OPTION: CommandOptionSpec = {
  name: 'help',
  kind: 'boolean',
  description: 'Show help for this command.',
};

const JSON_OPTION: CommandOptionSpec = {
  name: 'json',
  kind: 'boolean',
  description: 'Write a structured JSON response.',
};

const SELECTION_OPTION: CommandOptionSpec = {
  name: 'selection',
  kind: 'value',
  valueLabel: 'file',
  description: 'Read a Toolkit or upstream selection JSON file.',
};

const CREATE_SELECTION_OPTION: CommandOptionSpec = {
  name: 'selection',
  kind: 'value',
  valueLabel: 'file',
  description: 'Write the new selection to this explicit path.',
};

const RENDER_OPTIONS: readonly CommandOptionSpec[] = [
  { name: 'out', kind: 'value', valueLabel: 'directory', description: 'Write artifacts to this directory.' },
  { name: 'animation', kind: 'repeatable', valueLabel: 'name', description: 'Render an animation; may be repeated.' },
  { name: 'frames', kind: 'repeatable', valueLabel: 'name|all', description: 'Select frames; may be repeated.' },
  {
    name: 'bundle',
    kind: 'value',
    valueLabel: 'zip',
    allowedValues: ['zip'],
    description: 'Bundle artifacts as a ZIP file.',
  },
  { name: 'allow-partial', kind: 'boolean', description: 'Allow partial animation output.' },
];

const DISCOVERY_OPTIONS: readonly CommandOptionSpec[] = [
  { name: 'limit', kind: 'value', valueLabel: 'count', description: 'Return 1-100 items. Default: 20.' },
  { name: 'offset', kind: 'value', valueLabel: 'count', description: 'Skip matching items. Default: 0.' },
  { name: 'all', kind: 'boolean', description: 'Return all matching items.' },
];

const ASSET_WORKSPACE_OPTION: CommandOptionSpec = {
  name: 'workspace',
  kind: 'value',
  valueLabel: 'directory',
  description: 'Use this asset workspace instead of discovering one.',
};

const AUTHORING_SESSION_OPTION: CommandOptionSpec = {
  name: 'session',
  kind: 'value',
  valueLabel: 'session-id',
  description: 'Use this workspace-local authoring session.',
};

const ASSET_PREVIEW_OPTIONS: readonly CommandOptionSpec[] = [
  ASSET_WORKSPACE_OPTION,
  { name: 'asset', kind: 'value', valueLabel: 'local-id', description: 'Preview this pack asset.' },
  { name: 'animation', kind: 'value', valueLabel: 'name', description: 'Preview this animation.' },
  { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Preview this body type.' },
  { name: 'character', kind: 'value', valueLabel: 'selection.json', description: 'Use this character selection for overlap testing.' },
];

const ASSET_SCAFFOLD_OPTIONS: readonly CommandOptionSpec[] = [
  ASSET_WORKSPACE_OPTION,
  {
    name: 'out',
    kind: 'value',
    valueLabel: 'directory',
    description: 'Create the pack in this directory inside artist-packs.',
  },
  { name: 'pack-id', kind: 'value', valueLabel: 'id', description: 'Set the asset-pack id.' },
  {
    name: 'version',
    kind: 'value',
    valueLabel: 'semver',
    description: 'Set the asset-pack version. Default: 0.1.0.',
  },
  {
    name: 'display-name',
    kind: 'value',
    valueLabel: 'label',
    description: 'Set the artist-facing pack name.',
  },
  { name: 'author', kind: 'repeatable', valueLabel: 'name', description: 'Credit an author; may be repeated.' },
  { name: 'license', kind: 'repeatable', valueLabel: 'license', description: 'Declare a license; may be repeated.' },
  { name: 'url', kind: 'repeatable', valueLabel: 'url', description: 'Record a credit URL; may be repeated.' },
  { name: 'notes', kind: 'value', valueLabel: 'text', description: 'Record pack credit notes.' },
  { name: 'new', kind: 'boolean', description: 'Scaffold a new catalog item.' },
  { name: 'asset-id', kind: 'value', valueLabel: 'id', description: 'Set the new item local id.' },
  { name: 'type', kind: 'repeatable', valueLabel: 'type', description: 'Set or select an item type; may be repeated for audit selection.' },
  { name: 'body-type', kind: 'repeatable', valueLabel: 'type', description: 'Set or narrow body types; may be repeated.' },
  { name: 'animation', kind: 'repeatable', valueLabel: 'name', description: 'Set or narrow animations; may be repeated.' },
  { name: 'advanced', kind: 'boolean', description: 'Include advanced new-item guidance.' },
  { name: 'from-audit', kind: 'value', valueLabel: 'report', description: 'Scaffold from a complete animation audit JSON report.' },
  { name: 'item', kind: 'repeatable', valueLabel: 'item-id', description: 'Select an audited item; may be repeated.' },
];

const COMMAND_SPECS: readonly CommandSpec[] = [
  {
    command: [],
    usage: 'lpc-toolkit <command> [options]',
    description: 'Compose, discover, inspect, and render attributed LPC character sprites.',
    options: [HELP_OPTION],
    examples: [
      'lpc-toolkit --version',
      'lpc-toolkit -V',
      'lpc-toolkit capabilities --json',
      'lpc-toolkit catalog types',
      'lpc-toolkit character create hero',
      'lpc-toolkit character search hero --type hair --query braid --limit 20 --json',
      'lpc-toolkit catalog item hair_braid --json',
    ],
  },
  {
    command: ['asset'],
    usage: 'lpc-toolkit asset <command>',
    description: 'Author, package, install, inspect, and diagnose attributed artist asset packs.',
    options: [HELP_OPTION],
    examples: [
      'lpc-toolkit asset workspace init ./my-lpc-art',
      'lpc-toolkit asset validate ./artist-packs/acme.hair',
      'lpc-toolkit asset install ./dist/acme.hair-1.0.0.lpc-assets.zip',
      'lpc-toolkit asset doctor --json',
    ],
  },
  {
    command: ['asset', 'workspace'],
    usage: 'lpc-toolkit asset workspace <command>',
    description: 'Create and inspect standalone artist workspaces.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit asset workspace init ./my-lpc-art'],
  },
  {
    command: ['asset', 'workspace', 'init'],
    usage: 'lpc-toolkit asset workspace init <directory>',
    description: 'Initialize a standalone artist asset workspace without preparing base assets.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit asset workspace init ./my-lpc-art'],
  },
  {
    command: ['asset', 'authoring'],
    usage: 'lpc-toolkit asset authoring <command>',
    description: 'Create and resume provider-neutral asset authoring sessions from strict plans.',
    options: [HELP_OPTION],
    examples: [
      'lpc-toolkit asset authoring start --plan plan.json --json',
      'lpc-toolkit asset authoring status --session session-id --json',
    ],
  },
  {
    command: ['asset', 'authoring', 'start'],
    usage: 'lpc-toolkit asset authoring start --plan <plan.json> [--workspace <directory>] [--json]',
    description: 'Start one bounded asset authoring session from a strict plan.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'plan', kind: 'value', valueLabel: 'plan.json', description: 'Read the strict authoring plan.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring start --plan plan.json --json'],
  },
  {
    command: ['asset', 'authoring', 'status'],
    usage: 'lpc-toolkit asset authoring status --session <session-id> [--workspace <directory>] [--json]',
    description: 'Read the current state and safe next actions for a session.',
    options: [HELP_OPTION, JSON_OPTION, AUTHORING_SESSION_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset authoring status --session session-id --json'],
  },
  {
    command: ['asset', 'authoring', 'resume'],
    usage: 'lpc-toolkit asset authoring resume --session <session-id> [--workspace <directory>] [--json]',
    description: 'Resume a bounded asset authoring session from its latest checkpoint.',
    options: [HELP_OPTION, JSON_OPTION, AUTHORING_SESSION_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset authoring resume --session session-id --json'],
  },
  {
    command: ['asset', 'authoring', 'contract'],
    usage: 'lpc-toolkit asset authoring contract --session <session-id> [--refresh] [--workspace <directory>] [--json]',
    description: 'Create or inspect the provider-neutral sprite drawing contract.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'refresh', kind: 'boolean', description: 'Refresh stale planning evidence and invalidate prior checkpoints.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring contract --session session-id --json'],
  },
  {
    command: ['asset', 'authoring', 'import'],
    usage: 'lpc-toolkit asset authoring import --session <session-id> --target <target-id> --candidate <png> --contract-digest <sha256> [--replace-existing --expected-target-digest <sha256>] [--workspace <directory>] [--json]',
    description: 'Import one contract-bound candidate PNG through the session trust boundary.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'target', kind: 'value', valueLabel: 'target-id', description: 'Select the contract target to import.' },
      { name: 'candidate', kind: 'value', valueLabel: 'png', description: 'Read the candidate PNG.' },
      { name: 'contract-digest', kind: 'value', valueLabel: 'sha256', description: 'Bind the candidate to this contract digest.' },
      { name: 'replace-existing', kind: 'boolean', description: 'Authorize replacement of a pre-existing target with an expected digest.' },
      { name: 'expected-target-digest', kind: 'value', valueLabel: 'sha256', description: 'Require this exact digest when replacing an existing target.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring import --session session-id --target target-id --candidate candidate.png --contract-digest sha256:contract --json'],
  },
  {
    command: ['asset', 'authoring', 'validate'],
    usage: 'lpc-toolkit asset authoring validate --session <session-id> [--workspace <directory>] [--json]',
    description: 'Validate the session-owned asset pack and retain a digest-bound receipt.',
    options: [HELP_OPTION, JSON_OPTION, AUTHORING_SESSION_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset authoring validate --session session-id --json'],
  },
  {
    command: ['asset', 'authoring', 'acknowledge'],
    usage: 'lpc-toolkit asset authoring acknowledge --session <session-id> --acknowledgement <record.json> [--confirm] [--workspace <directory>] [--json]',
    description: 'Apply one exact human warning acknowledgement to the session pack.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'acknowledgement', kind: 'value', valueLabel: 'record.json', description: 'Read exactly one Core-valid acknowledgement record.' },
      { name: 'confirm', kind: 'boolean', description: 'Confirm the exact acknowledgement mutation.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring acknowledge --session session-id --acknowledgement record.json --confirm --json'],
  },
  {
    command: ['asset', 'authoring', 'declare'],
    usage: 'lpc-toolkit asset authoring declare --session <session-id> --declaration <declaration.json> [--confirm] [--workspace <directory>] [--json]',
    description: 'Record an explicit human release declaration for the current attributed pack evidence.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'declaration', kind: 'value', valueLabel: 'declaration.json', description: 'Read the strict human release declaration.' },
      { name: 'confirm', kind: 'boolean', description: 'Confirm the exact release declaration mutation.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring declare --session session-id --declaration declaration.json --confirm --json'],
  },
  {
    command: ['asset', 'authoring', 'accept-preview'],
    usage: 'lpc-toolkit asset authoring accept-preview --session <session-id> --preview-digest <sha256> --confirm [--workspace <directory>] [--json]',
    description: 'Accept the exact current attributed preview artifact set for the session release checkpoint.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'preview-digest', kind: 'value', valueLabel: 'sha256', description: 'Match the exact rendered preview PNG digest.' },
      { name: 'confirm', kind: 'boolean', description: 'Confirm the human preview acceptance.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring accept-preview --session session-id --preview-digest sha256:preview --confirm --json'],
  },
  {
    command: ['asset', 'authoring', 'draft'],
    usage: 'lpc-toolkit asset authoring draft --session <session-id> [--output <archive>] [--workspace <directory>] [--json]',
    description: 'Create a deterministic, non-installable draft recovery archive from the current session pack.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'output', kind: 'value', valueLabel: 'archive', description: 'Write the draft archive below the session release-artifact root.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring draft --session session-id --json'],
  },
  {
    command: ['asset', 'authoring', 'sync'],
    usage: 'lpc-toolkit asset authoring sync --session <session-id> [--confirm] [--workspace <directory>] [--json]',
    description: 'Synchronize the current session pack into the manager-owned generated overlay after explicit confirmation.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'confirm', kind: 'boolean', description: 'Confirm the manager-owned overlay and registry mutation.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring sync --session session-id --confirm --json'],
  },
  {
    command: ['asset', 'authoring', 'preview'],
    usage: 'lpc-toolkit asset authoring preview --session <session-id> [existing preview options] [--workspace <directory>] [--json]',
    description: 'Render an attributed session preview using the existing asset preview options.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      ...ASSET_PREVIEW_OPTIONS,
    ],
    examples: ['lpc-toolkit asset authoring preview --session session-id --animation walk --json'],
  },
  {
    command: ['asset', 'authoring', 'reconcile-manifest'],
    usage: 'lpc-toolkit asset authoring reconcile-manifest --session <session-id> --use <external|session> --expected-external-digest <sha256> [--workspace <directory>] [--json]',
    description: 'Resolve an external manifest change only with an explicit digest-bound choice.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      AUTHORING_SESSION_OPTION,
      { name: 'use', kind: 'value', valueLabel: 'external|session', allowedValues: ['external', 'session'], description: 'Choose the external or session manifest.' },
      { name: 'expected-external-digest', kind: 'value', valueLabel: 'sha256', description: 'Require this exact external manifest digest.' },
      ASSET_WORKSPACE_OPTION,
    ],
    examples: ['lpc-toolkit asset authoring reconcile-manifest --session session-id --use external --expected-external-digest sha256:manifest --json'],
  },
  {
    command: ['asset', 'init'],
    usage: 'lpc-toolkit asset init (--new | --from-audit <report>) [options]',
    description: 'Scaffold a new or audit-derived artist asset pack.',
    options: [HELP_OPTION, JSON_OPTION, ...ASSET_SCAFFOLD_OPTIONS],
    examples: [
      'lpc-toolkit asset init --new --pack-id acme.hair --asset-id moon-braid --display-name "ACME Hair" --type hair --body-type male --animation walk --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/hair',
      'lpc-toolkit asset init --from-audit audit.json --item hair_braid --pack-id acme.audit --display-name "ACME Audit" --author Alice --license "CC-BY-SA 4.0" --url https://example.com/acme/audit',
    ],
  },
  {
    command: ['asset', 'validate'],
    usage: 'lpc-toolkit asset validate <pack-directory>',
    description: 'Validate an artist asset pack, its PNGs, and its attribution.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset validate ./artist-packs/acme.hair --json'],
  },
  {
    command: ['asset', 'preview'],
    usage: 'lpc-toolkit asset preview <pack-directory> [options]',
    description: 'Render an attributed preview without changing active workspace output.',
    options: [HELP_OPTION, JSON_OPTION, ...ASSET_PREVIEW_OPTIONS],
    examples: [
      'lpc-toolkit asset preview ./artist-packs/acme.hair --asset moon-braid --animation walk',
    ],
  },
  {
    command: ['asset', 'sync'],
    usage: 'lpc-toolkit asset sync <pack-directory>',
    description: 'Link an artist pack and rebuild the managed workspace overlay.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset sync ./artist-packs/acme.hair --json'],
  },
  {
    command: ['asset', 'pack'],
    usage: 'lpc-toolkit asset pack <pack-directory> [--workspace <directory>] [--json]',
    description: 'Validate and publish a deterministic asset-pack archive.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: [
      'lpc-toolkit asset pack ./artist-packs/acme.hair --workspace ./my-lpc-art --json',
    ],
  },
  {
    command: ['asset', 'inspect'],
    usage: 'lpc-toolkit asset inspect <pack.lpc-assets.zip> [--json]',
    description: 'Inspect and validate an asset-pack archive, including draft status, without installing it.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: [
      'lpc-toolkit asset inspect ./acme.hair-1.0.0.lpc-assets.zip --json',
    ],
  },
  {
    command: ['asset', 'install'],
    usage: 'lpc-toolkit asset install <pack.lpc-assets.zip> [--workspace <directory>] [--json]',
    description: 'Install or update a verified asset-pack archive. Draft archives are rejected.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: [
      'lpc-toolkit asset install ./acme.hair-1.0.0.lpc-assets.zip --workspace ./my-lpc-art --json',
    ],
  },
  {
    command: ['asset', 'list'],
    usage: 'lpc-toolkit asset list [--workspace <directory>] [--json]',
    description: 'List active linked and installed asset packs.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset list --workspace ./my-lpc-art --json'],
  },
  {
    command: ['asset', 'remove'],
    usage: 'lpc-toolkit asset remove <pack-id> [--workspace <directory>] [--json]',
    description: 'Deactivate an asset pack and rebuild managed output.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset remove acme.hair --workspace ./my-lpc-art --json'],
  },
  {
    command: ['asset', 'doctor'],
    usage: 'lpc-toolkit asset doctor [--workspace <directory>] [--json]',
    description: 'Audit asset-pack lifecycle state and narrowly recover interrupted publication.',
    options: [HELP_OPTION, JSON_OPTION, ASSET_WORKSPACE_OPTION],
    examples: ['lpc-toolkit asset doctor --workspace ./my-lpc-art --json'],
  },
  {
    command: ['catalog'],
    usage: 'lpc-toolkit catalog <command>',
    description: 'Inspect the LPC asset catalog.',
    options: [HELP_OPTION],
    examples: [
      'lpc-toolkit catalog types',
      'lpc-toolkit catalog items --type hair --limit 20 --json',
      'lpc-toolkit catalog item hair_braid --json',
      'lpc-toolkit catalog audit-animations --animation walk --animation run --json',
    ],
  },
  {
    command: ['catalog', 'types'],
    usage: 'lpc-toolkit catalog types',
    description: 'List catalog type names.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit catalog types'],
  },
  {
    command: ['catalog', 'items'],
    usage: 'lpc-toolkit catalog items [options]',
    description: 'List and filter catalog items.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'typeName', description: 'Filter by item type.' },
      { name: 'search', kind: 'value', valueLabel: 'text', description: 'Filter by matching text.' },
      { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Filter by body type.' },
      { name: 'animation', kind: 'value', valueLabel: 'name', description: 'Filter by animation.' },
      { name: 'license', kind: 'value', valueLabel: 'license', description: 'Filter by license.' },
      ...DISCOVERY_OPTIONS,
    ],
    examples: ['lpc-toolkit catalog items --type hair --limit 20 --json'],
  },
  {
    command: ['catalog', 'item'],
    usage: 'lpc-toolkit catalog item <item-id-or-type/name>',
    description: 'Show one catalog item with credits and animation capabilities.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit catalog item hair_braid --json'],
  },
  {
    command: ['catalog', 'audit-animations'],
    usage: 'lpc-toolkit catalog audit-animations --animation <name> [options]',
    description: 'Audit selected standard animations and report drawing work.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      {
        name: 'animation',
        kind: 'repeatable',
        valueLabel: 'name',
        description: 'Audit a standard animation; may be repeated.',
      },
      { name: 'type', kind: 'value', valueLabel: 'typeName', description: 'Filter by item type.' },
      { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Filter by body type.' },
    ],
    examples: [
      'lpc-toolkit catalog audit-animations --animation walk --animation run --json',
    ],
  },
  {
    command: ['selection'],
    usage: 'lpc-toolkit selection <command>',
    description: 'Work with selection documents.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit selection validate --selection hero.json'],
  },
  {
    command: ['selection', 'validate'],
    usage: 'lpc-toolkit selection validate --selection <file>',
    description: 'Validate a selection document.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit selection validate --selection hero.json'],
  },
  {
    command: ['render'],
    usage: 'lpc-toolkit render --selection <file> --out <directory> [options]',
    description: 'Render an attributed spritesheet with an offline animation viewer.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION, ...RENDER_OPTIONS],
    examples: ['lpc-toolkit render --selection hero.json --out rendered'],
  },
  {
    command: ['token'],
    usage: 'lpc-toolkit token <command>',
    description: 'Encode or decode selection tokens.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit token encode --selection hero.json', 'lpc-toolkit token decode --token v2.example'],
  },
  {
    command: ['token', 'encode'],
    usage: 'lpc-toolkit token encode --selection <file>',
    description: 'Encode a selection as a token.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit token encode --selection hero.json'],
  },
  {
    command: ['token', 'decode'],
    usage: 'lpc-toolkit token decode --token <hash-or-token> [--out <file>]',
    description: 'Decode a token to a selection.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'token', kind: 'value', valueLabel: 'hash-or-token', description: 'Token to decode.' },
      { name: 'out', kind: 'value', valueLabel: 'file', description: 'Write the decoded selection to a file.' },
    ],
    examples: ['lpc-toolkit token decode --token v2.example --out hero.json'],
  },
  {
    command: ['preset'],
    usage: 'lpc-toolkit preset <command>',
    description: 'List, materialize, or render shared presets.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit preset list', 'lpc-toolkit preset materialize farmer --out farmer.json'],
  },
  {
    command: ['preset', 'list'],
    usage: 'lpc-toolkit preset list',
    description: 'List shared presets.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit preset list'],
  },
  {
    command: ['preset', 'materialize'],
    usage: 'lpc-toolkit preset materialize <preset-id> [--out <file>]',
    description: 'Materialize a shared preset as a selection.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      { name: 'out', kind: 'value', valueLabel: 'file', description: 'Write the selection to a file.' },
    ],
    examples: ['lpc-toolkit preset materialize farmer --out farmer.json'],
  },
  {
    command: ['preset', 'render'],
    usage: 'lpc-toolkit preset render <preset-id> --out <directory> [options]',
    description: 'Render an attributed spritesheet with an offline animation viewer.',
    options: [HELP_OPTION, JSON_OPTION, ...RENDER_OPTIONS],
    examples: ['lpc-toolkit preset render farmer --out rendered'],
  },
  {
    command: ['web'],
    usage: 'lpc-toolkit web [options]',
    description: 'Start the local LPC Toolkit Web UI.',
    options: [
      HELP_OPTION,
      { name: 'host', kind: 'value', valueLabel: 'host', description: 'Host interface to bind.' },
      { name: 'port', kind: 'value', valueLabel: 'port', description: 'Port to listen on.' },
      { name: 'no-open', kind: 'boolean', description: 'Do not open a browser.' },
    ],
    examples: ['lpc-toolkit web --port 4173 --no-open'],
  },
  {
    command: ['character'],
    usage: 'lpc-toolkit character <command>',
    description: 'Create, edit, inspect, preview, and render named characters.',
    options: [HELP_OPTION],
    examples: ['lpc-toolkit character create hero', 'lpc-toolkit character show hero'],
  },
  {
    command: ['character', 'create'],
    usage: 'lpc-toolkit character create <name> [options]',
    description: 'Create a named character selection.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      CREATE_SELECTION_OPTION,
      { name: 'preset', kind: 'value', valueLabel: 'id', description: 'Start from a shared preset.' },
      { name: 'body-type', kind: 'value', valueLabel: 'type', description: 'Set the initial body type. Default: male.' },
    ],
    examples: ['lpc-toolkit character create hero --body-type male'],
  },
  {
    command: ['character', 'list'],
    usage: 'lpc-toolkit character list',
    description: 'List named character selections.',
    options: [HELP_OPTION, JSON_OPTION],
    examples: ['lpc-toolkit character list'],
  },
  {
    command: ['character', 'show'],
    usage: 'lpc-toolkit character show (<name> | --selection <file>)',
    description: 'Show a character selection.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit character show hero'],
  },
  {
    command: ['character', 'search'],
    usage: 'lpc-toolkit character search (<name> | --selection <file>) --type <type> [options]',
    description: 'Search compatible items for a character type.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selection type to search.' },
      { name: 'query', kind: 'value', valueLabel: 'text', description: 'Filter matching items.' },
      ...DISCOVERY_OPTIONS,
    ],
    examples: [
      'lpc-toolkit character search hero --type hair --query braid --limit 20 --json',
    ],
  },
  {
    command: ['character', 'set'],
    usage: 'lpc-toolkit character set (<name> | --selection <file>) --type <type> --item <item-id-or-type/name> [options]',
    description: 'Set or replace one selected character type.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selection type to set.' },
      { name: 'item', kind: 'value', valueLabel: 'item-id-or-type/name', description: 'Catalog item to select.' },
      { name: 'variant', kind: 'value', valueLabel: 'id', description: 'Item variant to select.' },
      { name: 'recolor', kind: 'value', valueLabel: 'id', description: 'Item recolor to select.' },
    ],
    examples: [
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
    ],
  },
  {
    command: ['character', 'set-color'],
    usage: 'lpc-toolkit character set-color (<name> | --selection <file>) --type <type> --channel <id> (--color <id> | --default)',
    description: 'Set or clear one color channel owned by the selected asset.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selected asset slot that owns the channel.' },
      { name: 'channel', kind: 'value', valueLabel: 'id', description: 'Asset-owned channel ID, including primary.' },
      { name: 'color', kind: 'value', valueLabel: 'id', description: 'Explicit channel color to select.' },
      { name: 'default', kind: 'boolean', description: 'Clear the stored value and use the asset default.' },
    ],
    examples: [
      'lpc-toolkit character set-color hero --type expression --channel eyes --color green',
      'lpc-toolkit character set-color hero --type expression --channel eyes --default',
    ],
  },
  {
    command: ['character', 'remove'],
    usage: 'lpc-toolkit character remove (<name> | --selection <file>) --type <type> [options]',
    description: 'Remove one selected character type.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'type', kind: 'value', valueLabel: 'type', description: 'Selection type to remove.' },
    ],
    examples: ['lpc-toolkit character remove hero --type hair'],
  },
  {
    command: ['character', 'validate'],
    usage: 'lpc-toolkit character validate (<name> | --selection <file>)',
    description: 'Validate a character selection.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION],
    examples: ['lpc-toolkit character validate hero'],
  },
  {
    command: ['character', 'preview'],
    usage: 'lpc-toolkit character preview (<name> | --selection <file>) [options]',
    description: 'Render one attributed preview frame.',
    options: [
      HELP_OPTION,
      JSON_OPTION,
      SELECTION_OPTION,
      { name: 'animation', kind: 'value', valueLabel: 'name', description: 'Animation to preview. Default: walk.' },
      { name: 'direction', kind: 'value', valueLabel: 'id', description: 'Direction to preview. Default: down.' },
      { name: 'frame', kind: 'value', valueLabel: 'index', description: 'Frame index to preview. Default: 0.' },
      { name: 'out', kind: 'value', valueLabel: 'directory', description: 'Write preview artifacts to this directory.' },
    ],
    examples: ['lpc-toolkit character preview hero --animation walk --direction down --frame 0'],
  },
  {
    command: ['character', 'render'],
    usage: 'lpc-toolkit character render (<name> | --selection <file>) --out <directory> [options]',
    description: 'Render an attributed spritesheet with an offline animation viewer.',
    options: [HELP_OPTION, JSON_OPTION, SELECTION_OPTION, ...RENDER_OPTIONS],
    examples: ['lpc-toolkit character render hero --out rendered --animation walk'],
  },
];

function findCommandSpec(command: readonly string[]): CommandSpec | undefined {
  return COMMAND_SPECS.find(
    (spec) =>
      spec.command.length === command.length &&
      spec.command.every((part, index) => part === command[index]),
  );
}

function suggestOption(
  name: string,
  options: readonly CommandOptionSpec[],
): readonly string[] {
  const candidates = options
    .map((option) => ({ name: option.name, distance: editDistance(name, option.name) }))
    .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name));
  const bestDistance = candidates[0]?.distance;
  if (bestDistance === undefined || bestDistance > 3) return [];
  return candidates
    .filter((candidate) => candidate.distance === bestDistance)
    .map((candidate) => `--${candidate.name}`);
}

function renderCommandSpec(spec: CommandSpec): string {
  const lines = [spec.description, '', 'Usage:', `  ${spec.usage}`];
  const children = COMMAND_SPECS.filter(
    (candidate) =>
      candidate.command.length === spec.command.length + 1 &&
      spec.command.every((part, index) => candidate.command[index] === part),
  );
  if (children.length > 0) {
    lines.push('', 'Commands:', ...children.map((child) => `  ${child.usage}`));
  }
  if (spec.options.length > 0) {
    lines.push(
      '',
      'Options:',
      ...spec.options.map((option) => {
        const value = option.kind === 'boolean' ? '' : ` <${option.valueLabel ?? 'value'}>`;
        return `  --${option.name}${value}  ${option.description}`;
      }),
    );
  }
  if (spec.examples.length > 0) {
    lines.push('', 'Examples:', ...spec.examples.map((example) => `  ${example}`));
  }
  return `${lines.join('\n')}\n`;
}

export function helpForCommand(command: readonly string[]): string {
  return renderCommandSpec(findCommandSpec(command) ?? COMMAND_SPECS[0]!);
}

export function validateCommandArguments(parsed: ParsedArgs): CliIssue | undefined {
  const isCapabilities = parsed.command.length === 1 && parsed.command[0] === 'capabilities';
  const isAuthoring = parsed.command[0] === 'asset' && parsed.command[1] === 'authoring';
  if (!isCapabilities && !isAuthoring) return undefined;
  if (parsed.positionals.length === 0) return undefined;
  const positional = parsed.positionals[0]!;
  return {
    code: 'unexpected_argument',
    message: `${parsed.command.join(' ')} does not accept positional arguments.`,
    path: positional,
  };
}

export function validateCommandOptions(parsed: ParsedArgs): CliIssue | undefined {
  const spec = findCommandSpec(parsed.command);
  if (!spec) return undefined;
  for (const [name, value] of parsed.flags) {
    const option = spec.options.find((candidate) => candidate.name === name);
    if (!option) {
      return {
        code: 'unknown_option',
        message: `Unknown option: --${name}`,
        path: `--${name}`,
        details: { suggestions: suggestOption(name, spec.options) },
      };
    }
    const occurrences = Array.isArray(value) ? value : [value];
    if (option.kind !== 'boolean' && occurrences.some((occurrence) => occurrence === true)) {
      return {
        code: 'invalid_option',
        message: `--${name} requires a value.`,
        path: `--${name}`,
      };
    }
    if (option.kind !== 'repeatable' && Array.isArray(value)) {
      return {
        code: 'invalid_option',
        message: `--${name} may be supplied only once.`,
        path: `--${name}`,
      };
    }
    if (
      option.allowedValues &&
      typeof value === 'string' &&
      !option.allowedValues.includes(value)
    ) {
      return {
        code: 'invalid_option',
        message: `Unsupported value for --${name}: ${value}`,
        path: `--${name}`,
        details: { available: option.allowedValues },
      };
    }
  }
  return undefined;
}
