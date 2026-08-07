# CLI Compatibility

Plugin version `0.3.0` supports `@lpc-toolkit/cli >=0.2.0 <0.3.0`. The plugin
manifest owns the plugin version, while `compatibility.json` owns the supported
CLI range. This page is a checked projection of those two sources.

Install or upgrade the compatible public CLI only after the user agrees:

```sh
npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'
```

Node.js 22 or newer is required. Resolve the installed plugin directory to an
absolute path named `PLUGIN_ROOT`, then run:

```sh
node "$PLUGIN_ROOT/scripts/check-cli.mjs"
```

Interpret the JSON result:

- `cli_not_found`: stop and ask the user to install the compatible CLI.
- `cli_version_unsupported`: report the installed version and supported range,
  then ask the user to upgrade the CLI or use a compatible plugin.
- `cli_version_invalid` or `cli_check_failed`: show the structured message and
  stop because the command contract cannot be trusted.

Never install, upgrade, or switch the CLI silently. Character composition,
read-only animation audit, and asset authoring share this checker.

The authoring journey may use `asset-authoring-draft-recovery.v1`,
`lpc-toolkit.asset-authoring-draft-receipt.v1`,
`lpc-toolkit.asset-authoring-formal-archive-receipt.v1`,
`lpc-toolkit.asset-authoring-archive-inspection-receipt.v1`,
`lpc-toolkit.asset-authoring-install-receipt.v1`, and
`asset-authoring-consumer-install.v1`. The `acknowledge`, `declare`,
`accept-preview`, `sync`, `pack`, `inspect`, and `install` operations may run
only at the stage documented by the asset-authoring skill.
Formal archive publication and consumer installation remain explicit,
human-confirmed follow-up actions after the review-ready result.
