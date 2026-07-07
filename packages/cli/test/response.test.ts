import { describe, expect, it } from 'vitest';
import {
  commandError,
  commandOk,
  formatJsonResponse,
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
});
