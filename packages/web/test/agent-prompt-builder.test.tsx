import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AgentPromptBuilders,
  buildAnimationExtensionPrompt,
  buildAnimationExtensionResult,
  buildCreateCharacterPrompt,
  buildCreateCharacterResult,
  buildNewAssetPrompt,
  buildNewAssetResult,
} from '../src/components/agent-prompt-builder';

describe('agent prompt builders', () => {
  it('builds deterministic kickoff prompts for the three user goals', () => {
    expect(buildCreateCharacterPrompt({
      concept: 'fisher',
      startingPoint: 'Let the agent choose',
      details: 'practical clothes and fishing gear',
    })).toContain('from existing catalog art');
    const animationPrompt = buildAnimationExtensionPrompt({
      item: 'weapon_sword',
      animations: 'run',
      details: 'the audit proves a supported gap',
    });
    expect(animationPrompt).toMatch(/^\$lpc-animation-asset-audit\b/u);
    expect(animationPrompt).toContain('ask for my explicit confirmation before modifying assets');
    expect(animationPrompt).not.toContain('$lpc-asset-authoring');
    expect(buildNewAssetPrompt({
      concept: 'a moon braid',
      assetType: 'hair',
      animations: 'walk and idle',
    })).toContain('ask me for draft attribution before generating pixels');
  });

  it('states the review-ready endpoint without conflating release or install', () => {
    expect(buildCreateCharacterResult('fisher')).toContain('attributed preview');
    expect(buildAnimationExtensionResult('weapon_sword')).toContain('same item identity');
    expect(buildAnimationExtensionResult('weapon_sword')).toContain('review-ready');
    expect(buildNewAssetResult('hair')).toContain('One new hair identity');
    expect(buildNewAssetResult('hair')).toContain('Formal release and installation remain separate');
  });

  it('renders a goal chooser and expands only the default journey', () => {
    const html = renderToStaticMarkup(<AgentPromptBuilders />);

    expect(html).toContain('Build a character from existing art');
    expect(html).toContain('Add a missing animation');
    expect(html).toContain('Create a new asset');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/Prompt preview/g)).toHaveLength(1);
    expect(html.match(/>Reset</g)).toHaveLength(1);
    expect(html.match(/>Copy kickoff prompt</g)).toHaveLength(1);
    expect(html.match(/data-prompt-input="true"/g)).toHaveLength(3);
    expect(html).toContain('Journey stages');
    expect(html).toContain('Read catalog');
    expect(html).toContain('Write character file');
    expect(html).toContain('Expected result and files');
    expect(html).toContain('aria-live="polite"');
  });

  it('explains the executor and consent-bound continuation inside the active animation launcher', () => {
    const html = renderToStaticMarkup(<AgentPromptBuilders initialJourney="extend" />);

    expect(html).toContain('Copy kickoff prompt only copies this request');
    expect(html).toContain('$lpc-animation-asset-audit');
    expect(html).toContain('$lpc-asset-authoring');
    expect(html).toContain('same Codex task');
    expect(html).toContain('strict CLI workflow');
  });
});
