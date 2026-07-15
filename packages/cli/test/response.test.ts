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
});
