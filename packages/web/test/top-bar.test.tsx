import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '../src/components/layer-stack/top-bar';
import { createTranslator } from '../src/i18n';

interface ActionProps {
  readonly 'aria-label'?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly variant?: string;
  readonly size?: string;
  readonly onClick?: () => void;
}

function findAction(
  node: ReactNode,
  ariaLabel: string,
): ReactElement<ActionProps> | undefined {
  if (!isValidElement<ActionProps>(node)) return undefined;
  if (node.props['aria-label'] === ariaLabel) return node;

  for (const child of Children.toArray(node.props.children)) {
    const match = findAction(child, ariaLabel);
    if (match) return match;
  }

  return undefined;
}

describe('TopBar', () => {
  it('renders an explicit back-to-home action and emits navigation intent', () => {
    const onNavigateHome = vi.fn();
    const tree = TopBar({
      t: createTranslator('en'),
      loadingProgress: null,
      upstreamHref: 'https://example.com/upstream',
      onNavigateHome,
    });
    const html = renderToStaticMarkup(tree);

    const homeActionIndex = html.indexOf('← Back to home');
    const brandIndex = html.indexOf('LPC');

    expect(homeActionIndex).toBeGreaterThanOrEqual(0);
    expect(brandIndex).toBeGreaterThan(homeActionIndex);

    const action = findAction(tree, '← Back to home');
    expect(action).toBeDefined();
    expect(action?.props.className).toContain('border-accent/50');
    expect(action?.props.className).toContain('bg-accent/10');
    expect(action?.props.className).toContain('text-accent');
    expect(action?.props.className).toContain('hover:bg-accent/20');
    action?.props.onClick?.();
    expect(onNavigateHome).toHaveBeenCalledOnce();
  });

  it('does not render the asset-pack editor action', () => {
    const tree = TopBar({
      t: createTranslator('en'),
      loadingProgress: null,
      upstreamHref: 'https://example.com/upstream',
      onNavigateHome: vi.fn(),
    });
    const html = renderToStaticMarkup(tree);

    expect(html).not.toContain('Repair an Asset Pack');
  });
});
