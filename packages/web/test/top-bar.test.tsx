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

    expect(html).toContain('← Back to home');

    const action = findAction(tree, '← Back to home');
    expect(action).toBeDefined();
    action?.props.onClick?.();
    expect(onNavigateHome).toHaveBeenCalledOnce();
  });
});
