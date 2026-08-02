import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AgentPromptBuilders,
  buildAnimationAuditPrompt,
  buildCreateCharacterPrompt,
  buildExportCharacterPrompt,
  buildRefineCharacterPrompt,
} from '../src/components/agent-prompt-builder';

describe('agent prompt builders', () => {
  it('builds deterministic prompts from the default field values', () => {
    expect(buildCreateCharacterPrompt({
      concept: 'fisher',
      startingPoint: 'Let the agent choose',
      details: 'practical clothes, boots, and fishing gear',
    })).toContain('Create an LPC character based on a fisher concept');
    expect(buildRefineCharacterPrompt({
      characterName: 'fisher',
      part: 'hair',
      result: 'short brown hair that stays clear of the face',
    })).toContain("Refine my LPC character named fisher by changing its hair");
    expect(buildExportCharacterPrompt({
      characterName: 'fisher',
      animations: 'walk and idle',
      bundle: 'attributed ZIP bundle',
    })).toContain('verify the metadata and both credits files');
    expect(buildAnimationAuditPrompt({
      assetType: 'clothes',
      animations: 'walk and run',
      worklistSize: '20',
    })).toContain('read-only animation audit');
  });

  it('renders four editable, resettable prompt cards with copy controls', () => {
    const html = renderToStaticMarkup(<AgentPromptBuilders />);

    expect(html).toContain('Create a character');
    expect(html).toContain('Refine a character');
    expect(html).toContain('Preview and export');
    expect(html).toContain('Audit animation assets');
    expect(html.match(/>Reset</g)).toHaveLength(4);
    expect(html.match(/>Copy prompt</g)).toHaveLength(4);
    expect(html).toContain('value="fisher"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="100"');
    expect(html.match(/data-prompt-input="true"/g)).toHaveLength(12);
    expect(html).toContain('<mark data-prompt-input="true"');
    expect(html).toContain('>fisher</mark>');
  });
});
