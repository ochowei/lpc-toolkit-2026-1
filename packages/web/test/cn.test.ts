import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/cn';

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('lets later tailwind classes win on conflict', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
