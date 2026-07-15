# CLI Compatibility

Plugin version `0.1.0` supports `@lpc-toolkit/cli >=0.1.4-beta-1 <0.2.0`.
The minimum development CLI is installed from a locally packed tarball, not
from npm. From the repository root, run:

```sh
rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp
npm install -g /tmp/lpc-toolkit-cli-0.1.4-beta-1.tgz
```

0.1.4-beta-1 is a development version and is not published to npm. The
ordinary public stable install remains `npm install -g @lpc-toolkit/cli`; use
the checker below to confirm that an installed stable version is compatible
with this plugin before authoring a character.

Before any character operation, resolve this installed skill directory to an
absolute path named `SKILL_DIR`, then run the checker by that absolute path.
Do not assume the current working directory is the plugin or skill directory.

```sh
node "$SKILL_DIR/scripts/check-cli.mjs"
```

Interpret the JSON result:

- `cli_not_found`: stop and ask the user to install the compatible local
  development tarball; do not install it automatically.
- `cli_version_unsupported`: report the installed version and supported range,
  then ask the user to upgrade or use a compatible plugin version.
- `cli_version_invalid` or `cli_check_failed`: show the structured message and
  stop because the command contract cannot be trusted.

Node.js 22 or newer is required by the CLI. Plugin and CLI versions are
independent; update this file, the checker constants, tests, and release notes
together when the supported range changes.
