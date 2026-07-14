# CLI Compatibility

Plugin version `0.1.0` supports `@lpc-toolkit/cli >=0.1.3-alpha-1 <0.2.0`.

Before any character operation, resolve this skill's directory and run:

```sh
node scripts/check-cli.mjs
```

Interpret the JSON result:

- `cli_not_found`: stop and ask the user to install the public CLI with
  `npm install -g @lpc-toolkit/cli`; do not install it automatically.
- `cli_version_unsupported`: report the installed version and supported range,
  then ask the user to upgrade or use a compatible plugin version.
- `cli_version_invalid` or `cli_check_failed`: show the structured message and
  stop because the command contract cannot be trusted.

Node.js 22 or newer is required by the CLI. Plugin and CLI versions are
independent; update this file, the checker constants, tests, and release notes
together when the supported range changes.
