import { describe, expect, it } from 'vitest';
import {
  commandError,
  commandOk,
  formatJsonResponse,
  formatHumanResponse,
  type CliIssue,
} from '../src/response.js';

describe('response envelope', () => {
  it('formats success as stable JSON', () => {
    const warning: CliIssue = {
      code: 'catalog_warning',
      message: 'One catalog file was skipped.',
    };

    expect(JSON.parse(formatJsonResponse(commandOk('catalog types', { count: 3 }, [warning]))))
      .toEqual({
        ok: true,
        command: 'catalog types',
        data: { count: 3 },
        warnings: [warning],
        errors: [],
      });
  });

  it('formats errors without data', () => {
    const response = commandError('render', {
      code: 'missing_sprite_path',
      message: 'Missing spritesheets/body/bodies/male/walk.png',
    });

    expect(JSON.parse(formatJsonResponse(response))).toEqual({
      ok: false,
      command: 'render',
      data: null,
      warnings: [],
      errors: [
        {
          code: 'missing_sprite_path',
          message: 'Missing spritesheets/body/bodies/male/walk.png',
        },
      ],
    });
  });

  it('preserves structured issue suggestions', () => {
    const response = commandError('catalog items', {
      code: 'unknown_option',
      message: 'Unknown option: --tpye',
      path: '--tpye',
      details: { suggestions: ['--type'] },
    });

    expect(JSON.parse(formatJsonResponse(response)).errors[0]).toEqual({
      code: 'unknown_option',
      message: 'Unknown option: --tpye',
      path: '--tpye',
      details: { suggestions: ['--type'] },
    });
  });

  it('formats character preview and render artifacts explicitly', () => {
    const artifacts = [
      { type: 'preview', path: '/tmp/hero.preview.png' },
      { type: 'credits_txt', path: '/tmp/hero.credits.txt' },
    ];

    expect(formatHumanResponse(commandOk('character preview', {
      artifacts,
      metadataPath: '/tmp/hero.metadata.json',
    }), '')).toContain('Preview complete. Artifacts (2)');
    expect(formatHumanResponse(commandOk('character render', {
      artifacts,
      metadataPath: '/tmp/hero.metadata.json',
    }), '')).toContain('Render complete. Artifacts (2)');
  });

  it('formats release provenance verification as bound evidence, not recreated approval', () => {
    const output = formatHumanResponse(commandOk('asset provenance verify', {
      schema: 'lpc-toolkit.asset-release-provenance-verification.v1',
      verified: true,
      archivePath: '/consumer/release.lpc-assets.zip',
      provenancePath: '/consumer/release-provenance.json',
      packId: 'acme.hair',
      version: '1.0.0',
      archiveDigest: 'sha256:' + 'a'.repeat(64),
      manifestDigest: 'sha256:' + 'b'.repeat(64),
      contentDigest: 'sha256:' + 'c'.repeat(64),
      sourceDigests: [],
      recordCount: 2,
      releaseDeclarationReceiptDigest: 'sha256:' + 'd'.repeat(64),
      previewAcceptanceReceiptDigest: 'sha256:' + 'e'.repeat(64),
      previewArtifacts: [],
      humanEvidence: {
        releaseDeclarationReceiptRecreated: false,
        previewAcceptanceReceiptRecreated: false,
      },
    }), '');

    expect(output).toContain('Release provenance verification: verified');
    expect(output).toContain('Provenance records: 2');
    expect(output).toContain('Human release declaration recreated: no');
    expect(output).toContain('Human preview acceptance recreated: no');
  });

  it('formats issue suggestions and available values from structured details', () => {
    const output = formatHumanResponse(commandError('character set', {
      code: 'unknown_item',
      message: 'Unknown item: braid',
      details: { suggestions: ['braids'], available: ['bob', 'long'] },
    }), '');

    expect(output).toContain('Did you mean: braids');
    expect(output).toContain('Available: bob, long');
  });

  it('formats discovery counts without a next offset when the page is complete', () => {
    const output = formatHumanResponse(commandOk('catalog items', {
      items: [{
        itemId: 'braids',
        typeName: 'hair',
        name: 'Braids',
        supportedBodyTypes: ['male'],
        variants: ['brown'],
        recolors: [],
        animations: ['walk'],
        licenses: ['GPL'],
        creditCount: 1,
      }],
      page: {
        limit: 1,
        offset: 1,
        returned: 1,
        total: 2,
        hasMore: false,
        nextOffset: null,
      },
    }), '');

    expect(output).toContain('Catalog items (1 of 2)');
    expect(output).not.toContain('More results available');
  });

  it('formats bounded suggestions for a successful empty discovery search', () => {
    const output = formatHumanResponse(commandOk('character search', {
      items: [],
      count: 0,
      page: {
        limit: 20,
        offset: 0,
        returned: 0,
        total: 0,
        hasMore: false,
        nextOffset: null,
      },
      suggestions: [{ itemId: 'braids', typeName: 'hair', name: 'Braids' }],
    }), '');

    expect(output).toContain('Compatible items (0 of 0)');
    expect(output).toContain('Suggestions:\n- hair/Braids [braids]');
  });

  it('formats consent-scoped provider handoff status and next action without paths', () => {
    const output = formatHumanResponse(commandOk('asset authoring provider handoff', {
      schema: 'lpc-toolkit.asset-provider-handoff.v1',
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: `sha256:${'a'.repeat(64)}`,
      provider: { id: 'provider.example', adapter: { id: 'agent-adapter.example', version: '1.0.0' } },
      status: 'consent-required',
      invocation: null,
      invocationDigest: null,
      refusal: null,
      safety: 'requires-confirmation',
      nextActions: [{
        id: 'confirm-provider-handoff',
        summary: 'Confirm the exact provider scope.',
        command: 'asset authoring provider handoff --confirm',
        safety: 'requires-confirmation',
        requiredInputs: ['confirm'],
        preconditionDigests: [`sha256:${'a'.repeat(64)}`],
        expectedCheckpoint: null,
      }],
    }), 'fallback\n');

    expect(output).toContain('Provider handoff: provider.example (consent-required)');
    expect(output).toContain('Safety: requires-confirmation');
    expect(output).toContain('Next command: asset authoring provider handoff --confirm');
    expect(output).not.toContain('/private/');
  });

  it('formats provider result staging and refusal without candidate paths', () => {
    const output = formatHumanResponse(commandOk('asset authoring provider result', {
      schema: 'lpc-toolkit.asset-provider-result-response.v1',
      sessionId: '00000000-0000-4000-8000-000000000000',
      contractDigest: `sha256:${'a'.repeat(64)}`,
      provider: { id: 'provider.example', adapter: { id: 'agent-adapter.example', version: '1.0.0' } },
      status: 'refused',
      invocationDigest: `sha256:${'b'.repeat(64)}`,
      result: null,
      refusal: {
        schema: 'lpc-toolkit.asset-provider-refusal.v1',
        invocationDigest: `sha256:${'b'.repeat(64)}`,
        sessionId: '00000000-0000-4000-8000-000000000000',
        contractDigest: `sha256:${'a'.repeat(64)}`,
        operation: 'sprite-candidate.v1',
        provider: { id: 'provider.example', adapter: { id: 'agent-adapter.example', version: '1.0.0' } },
        targetIds: ['sprites/moon-braid/foreground/walk.png'],
        consentScopeDigest: `sha256:${'c'.repeat(64)}`,
        referenceDigests: [],
        code: 'asset_provider_timeout',
        nextAction: 'retry-within-scope',
      },
      candidate: null,
      safety: 'requires-confirmation',
      nextActions: [{
        id: 'retry-provider-within-scope',
        summary: 'Retry the provider operation within the unchanged consent scope.',
        command: 'asset authoring provider handoff --confirm',
        safety: 'requires-confirmation',
        requiredInputs: ['descriptor', 'consent', 'confirm'],
        preconditionDigests: [`sha256:${'a'.repeat(64)}`],
        expectedCheckpoint: null,
      }],
    }), 'fallback\n');

    expect(output).toContain('Provider result: provider.example (refused)');
    expect(output).toContain('Refusal: asset_provider_timeout');
    expect(output).toContain('Next command: asset authoring provider handoff --confirm');
    expect(output).not.toContain('/private/');
  });
});
