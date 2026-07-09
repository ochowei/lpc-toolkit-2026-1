import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LandingPage } from '../src/components/landing-page';

describe('LandingPage', () => {
  it('renders CLI usage and the composer entry action', () => {
    const html = renderToStaticMarkup(<LandingPage onNavigate={() => {}} />);

    expect(html).toContain('LPC Toolkit');
    expect(html).toContain('CLI quick start');
    expect(html).toContain('pnpm --filter @lpc-toolkit/cli build');
    expect(html).toContain('node packages/cli/dist/index.js --help');
    expect(html).toContain('lpc-toolkit catalog types');
    expect(html).toContain(
      'lpc-toolkit render --selection &lt;file&gt; --out &lt;dir&gt;',
    );
    expect(html).toContain(
      'lpc-toolkit preset render &lt;preset-id&gt; --out &lt;dir&gt;',
    );
    expect(html).toContain('Open Composer');
  });
});
