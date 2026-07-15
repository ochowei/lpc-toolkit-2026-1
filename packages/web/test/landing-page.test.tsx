import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../src/components/landing-page';

describe('LandingPage', () => {
  it('renders a complete single-entry CLI guide and two composer actions', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('CLI quick start');
    expect(html).toContain('npm install -g @lpc-toolkit/cli');
    expect(html).toContain('npx @lpc-toolkit/cli --help');
    expect(html).toContain(
      'rtk pnpm --filter @lpc-toolkit/cli pack --pack-destination /tmp',
    );
    expect(html).toContain(
      'npm install -g /tmp/lpc-toolkit-cli-0.1.4-beta-1.tgz',
    );
    expect(html).toContain(
      '0.1.4-beta-1 is a development version and is not published to npm',
    );
    expect(html).toContain('Node.js 22 or newer');
    expect(html).toContain('Create and edit a named character');
    expect(html).toContain('./characters/');

    const workflowCommands = [
      'lpc-toolkit character create hero --preset farmer',
      'lpc-toolkit character search hero --type hair --query braid --limit 20 --json',
      'lpc-toolkit catalog item hair_braid --json',
      'lpc-toolkit character set hero --type hair --item hair_braid --recolor lpcr.brown',
      'lpc-toolkit character preview hero',
      'lpc-toolkit character render hero --out ./dist/hero --animation walk --bundle zip',
    ];
    const workflowPositions = workflowCommands.map((command) => {
      expect(html).toContain(command);
      return html.indexOf(command);
    });
    expect(workflowPositions).toEqual([...workflowPositions].sort((a, b) => a - b));

    expect(html).toContain('lpc-toolkit preset render farmer');
    expect(html).toContain('lpc-toolkit selection validate --selection selection.json');
    expect(html).toContain('lpc-toolkit catalog types');
    expect(html).toContain(
      'lpc-toolkit catalog items --type hair --limit 20 --json',
    );
    expect(html).toContain('page.nextOffset');
    expect(html).toContain('--offset');
    expect(html).toContain('lpc-toolkit token encode --selection selection.json');
    expect(html).toContain('lpc-toolkit web');
    expect(html).toContain('.credits.txt');
    expect(html).toContain('.credits.csv');
    expect(html).toContain('Keep both attribution files with exported sprites.');
    const headerStart = html.indexOf('<header');
    const headerEnd = html.indexOf('</header>');
    expect(html.slice(headerStart, headerEnd)).toContain('Open Composer');
    expect(html.match(/Open Composer/g)).toHaveLength(2);
  });
});
