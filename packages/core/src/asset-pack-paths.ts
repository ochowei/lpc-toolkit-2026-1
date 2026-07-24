import { ANIMATIONS } from './constants.js';

function animationFolder(animation: string): string {
  const matched = ANIMATIONS.find((entry) => entry.value === animation);
  return matched?.folderName ?? matched?.value ?? animation;
}

function variantToFilename(variant: string): string {
  return variant.replaceAll(' ', '_');
}

export function extensionDestinationBasePath(
  destinationPath: string,
  animation: string,
  variant: string | undefined,
): string | undefined {
  const relative = destinationPath.replace(/^spritesheets\//, '');
  const suffix = variant
    ? `${animationFolder(animation)}/${variantToFilename(variant)}.png`
    : `${animationFolder(animation)}.png`;
  if (!relative.endsWith(suffix)) return undefined;
  return relative.slice(0, -suffix.length);
}
