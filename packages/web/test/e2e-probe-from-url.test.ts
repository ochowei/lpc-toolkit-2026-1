import { describe, expect, it } from 'vitest';
import { e2eProbeFromUrl } from '../src/lib/e2e-probe-from-url';

describe('e2eProbeFromUrl', () => {
  it('returns true only for e2eProbe=1', () => {
    expect(e2eProbeFromUrl('?e2eProbe=1')).toBe(true);
    expect(e2eProbeFromUrl('?assetSource=local&e2eProbe=1')).toBe(true);
  });

  it('returns false when the flag is absent or invalid', () => {
    expect(e2eProbeFromUrl('')).toBe(false);
    expect(e2eProbeFromUrl('?assetSource=local')).toBe(false);
    expect(e2eProbeFromUrl('?e2eProbe=true')).toBe(false);
    expect(e2eProbeFromUrl('?e2eProbe=0')).toBe(false);
  });
});
