# Web Landing Character Guide Design

**Date:** 2026-07-13

## Goal

Make the web landing page a complete first-use guide for the public CLI. A new
user should understand how to install the CLI, create and edit a persistent
named character, preview it, render attributed output, and discover the
secondary CLI workflows without reading another page first.

## Page Structure

The landing page uses one content column throughout. Sections appear in the
order a new user needs them:

1. Product introduction.
2. CLI installation and Node.js requirement.
3. A complete named-character workflow using one `hero` example.
4. Render output and mandatory attribution artifacts.
5. Secondary commands for presets, selection JSON, catalog exploration, token
   conversion, and the packaged local web server.
6. A final Web Composer section with the page's only `Open Composer` action.

The header no longer contains a Composer button. The current side-by-side CLI
and Web UI introduction is removed so the page remains a single-column reading
flow at every viewport width.

## Character Workflow

The primary example explains that named characters avoid hand-authoring a
selection JSON file and are persisted under `./characters/`. It presents these
commands in execution order:

```sh
lpc-toolkit character create hero --preset farmer
lpc-toolkit character search hero --type hair --query braid
lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown
lpc-toolkit character preview hero
lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip
```

Short descriptions connect each command to the user goal: establish a starting
character, discover compatible items, update the stored selection, inspect a
preview, and publish final output.

## Secondary CLI Workflows

The landing page keeps the existing public workflows but makes their secondary
role clear. It includes examples for preset rendering, selection validation and
rendering from a JSON file, catalog inspection, token encoding, and
`lpc-toolkit web`. These examples remain copyable code blocks and do not compete
with the named-character workflow as the primary tutorial.

## Attribution

The render-output section continues to state that output includes the composed
sprite sheet, metadata JSON, `.credits.txt`, and `.credits.csv`. It explicitly
instructs users to keep both credit files with exported sprites. Character
preview and render descriptions must not imply that attribution is optional.

## Components and Architecture

The change remains local to `LandingPage`. It does not introduce state, hooks,
new dependencies, core logic, browser adapters, or changes to composition and
export behavior. Existing Tailwind utilities and the shared `Button` component
remain in use.

## Testing

The server-rendered landing-page test will verify:

- the five-command named-character workflow is present in execution order;
- the page explains `./characters/` persistence;
- attribution artifacts and the instruction to retain them remain present;
- secondary CLI workflows remain discoverable;
- exactly one `Open Composer` action is rendered.

The focused landing-page test is run first for the TDD red/green cycle. After
implementation, the web package typecheck, focused test, and repository boundary
check provide final verification.

## Out of Scope

- Changing CLI behavior, help output, storage paths, or render semantics.
- Adding navigation, tabs, accordions, or interactive tutorial state.
- Changing the Composer UI.
- Adding dependencies or modifying `upstream/`.
