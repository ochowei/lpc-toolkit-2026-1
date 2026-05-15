import type {
  Catalog,
  CreditsManifest,
  License,
  Selections,
} from './types.js';

export function getCredits(
  selections: Selections,
  catalog: Catalog,
): CreditsManifest {
  void selections;
  void catalog;
  throw new Error('not implemented');
}

export function computeEffectiveLicense(credits: CreditsManifest): License {
  void credits;
  throw new Error('not implemented');
}
