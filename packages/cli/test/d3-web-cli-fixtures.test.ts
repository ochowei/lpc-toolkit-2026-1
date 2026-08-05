import { describe, expect, it } from 'vitest';
import {
  parseAssetAuthoringPlan,
  parseAssetWebCliHandoffJson,
} from '@lpc-toolkit/core';
import { inspectAssetPackArchiveBytes } from '@lpc-toolkit/asset-pack-format';
import { nodeAssetPackFormatRuntime } from '../src/asset-pack-node-runtime.js';
import { createD3WebCliFixtures } from './fixtures/d3-web-cli-fixtures.js';

describe('D3 Web-to-CLI local fixtures', () => {
  it('provides a verified archive, strict handoff, attach plan, and bounded variants', async () => {
    const fixtures = await createD3WebCliFixtures();
    const handoff = parseAssetWebCliHandoffJson(fixtures.handoffJson);
    const plan = parseAssetAuthoringPlan(fixtures.attachPlan);
    const archive = await inspectAssetPackArchiveBytes({
      archiveBytes: fixtures.archiveBytes,
      runtime: nodeAssetPackFormatRuntime,
    });

    expect(handoff.ok).toBe(true);
    expect(plan.ok).toBe(true);
    expect(archive.kind).toBe('verified');
    expect(fixtures.handoff.attribution.required).toBe(true);
    expect(fixtures.attributionHandoff.attribution.required).toBe(true);
    expect(fixtures.staleArchiveBytes).not.toEqual(fixtures.archiveBytes);
    expect(fixtures.tamperedArchiveBytes).not.toEqual(fixtures.archiveBytes);
    expect(fixtures.interruptedStaging.stagingDirectoryName).toBe('.d3-handoff-pending');
    expect(fixtures.handoffJson).not.toMatch(/(?:password\s*[:=]|token\s*[:=]|cookie\s*[:=]|workspaceRoot\s*[:=]|\/Users\/)/iu);
    expect(fixtures.attachPlanJson).not.toMatch(/(?:password\s*[:=]|token\s*[:=]|cookie\s*[:=]|workspaceRoot\s*[:=]|\/Users\/)/iu);
  });
});
