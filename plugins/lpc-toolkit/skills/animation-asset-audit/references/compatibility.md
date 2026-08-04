# CLI Compatibility

Plugin version `0.2.1` supports `@lpc-toolkit/cli >=0.2.0 <0.3.0`. Install or
upgrade the compatible public CLI from npm:

```sh
npm install -g '@lpc-toolkit/cli@>=0.2.0 <0.3.0'
```

Use the checker below to confirm that the installed version is compatible with
this plugin before auditing animation assets.

Before any animation audit operation, resolve this installed skill directory to
an absolute path named `SKILL_DIR`, then run the checker by that absolute path.
Do not assume the current working directory is the plugin or skill directory.

```sh
node "$SKILL_DIR/scripts/check-cli.mjs"
```

Interpret the JSON result:

- `cli_not_found`: stop and ask the user to install the compatible public CLI;
  do not install it automatically.
- `cli_version_unsupported`: report the installed version and supported range,
  then ask the user to upgrade or use a compatible plugin version.
- `cli_version_invalid` or `cli_check_failed`: show the structured message and
  stop because the command contract cannot be trusted.

Node.js 22 or newer is required by the CLI. Plugin and CLI versions are
independent; update this file, the checker constants, tests, and release notes
together when the supported range changes.

These skills intentionally do not implement the newer authoring-session
workflow or its release boundary. They must not claim or invoke
`asset-authoring-session.v1`, `sprite-drawing-contract.v1`, or
`asset-authoring-release.v1`, or `asset-authoring-draft-recovery.v1`; they also
refuse
`lpc-toolkit.asset-release-declaration.v1`,
`lpc-toolkit.asset-authoring-release-receipt.v1`,
`lpc-toolkit.asset-authoring-draft-receipt.v1`, and the
`asset authoring acknowledge`, `declare`, `accept-preview`, `draft`, and `sync`
commands. The audit workflow remains limited to the commands listed in its
versioned contract, and `catalog audit-animations` stays read-only.
