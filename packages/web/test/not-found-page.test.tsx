import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFoundPage } from '../src/components/not-found-page';

describe('NotFoundPage', () => {
  it('renders a simple 404 with home and composer actions', () => {
    const html = renderToStaticMarkup(<NotFoundPage onNavigate={() => {}} />);

    expect(html).toContain('Page not found');
    expect(html).toContain('Back to Home');
    expect(html).toContain('Open Composer');
  });
});
