# Landing Page CLI Examples Design

## Goal

Make the web landing page useful to public `@lpc-toolkit/cli` users by showing
two short, copyable workflows: rendering a built-in preset and validating then
rendering a custom selection file.

## Audience and Scope

The primary audience is someone using the published npm package, not a
contributor building the CLI from this repository. The landing page remains a
concise entry point rather than duplicating the complete CLI README.

The change is limited to landing-page content and its focused server-rendering
test. It adds no dependency, interactive state, CLI behavior, or changes to the
composer route.

## Page Content

Replace the repository-local quick start with public package instructions:

- global installation with `npm install -g @lpc-toolkit/cli`;
- an `npx @lpc-toolkit/cli --help` alternative for running without a global
  installation;
- the Node.js 22-or-newer requirement.

Present two copyable example cards using the existing visual language and code
block styling:

1. **Render a preset** uses the built-in `farmer` preset and writes a walking
   render to `./farmer`.
2. **Render a custom selection** shows a valid
   `lpc-toolkit.selection.v1` JSON document containing a male body with the
   light `Body Color`, then validates `selection.json` and renders it to
   `./rendered`.

The custom render command requests the walk animation, all frames, and a ZIP so
the example demonstrates the CLI's useful render outputs without introducing a
second advanced example.

Keep the existing Web UI card and composer actions. Retain a compact common
commands reference below the examples, but make the two workflows the primary
explanation.

## Output and Attribution Guidance

Add a short output note explaining that render commands produce the composed
sprite sheet, metadata JSON, and `.credits.txt` and `.credits.csv` attribution
files. State that the attribution files must remain with exported sprites.

This wording is required product guidance, consistent with the CLI behavior and
repository attribution rules. The page must not imply that credits are
optional, including when optional frame or ZIP outputs are requested.

## Layout and Behavior

Use static React markup in `landing-page.tsx`. On large screens, the two example
cards may form a two-column grid; on narrow screens they stack. Code blocks
remain horizontally scrollable. No tabs, copy buttons, syntax-highlighting
dependency, or client-side state is added.

## Testing and Verification

Follow test-driven development by first updating the focused landing-page test
to require:

- public npm and `npx` usage;
- the preset render example;
- the selection schema and validate/render workflow;
- the generated credit filenames and mandatory attribution guidance;
- the existing composer entry action.

Confirm the updated test fails because the new content is absent, implement the
smallest landing-page change that passes it, then run the focused web test, web
typecheck, and repository boundary check.
