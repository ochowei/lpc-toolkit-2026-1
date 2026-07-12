import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../src/components/landing-page';

describe('LandingPage', () => {
  it('renders public CLI workflows and the composer entry action', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('CLI quick start');
    expect(html).toContain('npm install -g @lpc-toolkit/cli');
    expect(html).toContain('npx @lpc-toolkit/cli --help');
    expect(html).toContain('Node.js 22 or newer');
    expect(html).toContain('Render a preset');
    expect(html).toContain(
      'lpc-toolkit preset render farmer --out ./farmer --animation walk',
    );
    expect(html).toContain('Render a custom selection');
    expect(html).toContain('lpc-toolkit.selection.v1');
    expect(html).toContain(
      'lpc-toolkit selection validate --selection selection.json',
    );
    expect(html).toContain(
      'lpc-toolkit render --selection selection.json --out ./rendered --animation walk --frames all --bundle zip',
    );
    expect(html).toContain('.credits.txt');
    expect(html).toContain('.credits.csv');
    expect(html).toContain('Keep both attribution files with exported sprites.');
    expect(html).toContain('Open Composer');
  });
});
