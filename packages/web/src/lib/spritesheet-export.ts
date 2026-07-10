import {
  creditsToCsv,
  creditsToTxt,
  type ComposedSheet,
  type CreditsManifest,
} from '@lpc-toolkit/core';

function encodePng(canvas: ComposedSheet['canvas']): Promise<ArrayBuffer> {
  const browserCanvas = canvas as unknown as HTMLCanvasElement;

  return new Promise((resolve, reject) => {
    browserCanvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('toBlob returned null'));
        return;
      }

      void blob.arrayBuffer().then(resolve, reject);
    }, 'image/png');
  });
}

export function assertExportableCredits(credits: CreditsManifest): void {
  if (credits.entries.length === 0) {
    throw new Error('Cannot export pixels without resolved credits.');
  }
}

export async function exportSpritesheetBundle(
  sheet: ComposedSheet,
  animation: string,
): Promise<Blob> {
  assertExportableCredits(sheet.credits);

  const [{ default: JSZip }, png] = await Promise.all([
    import('jszip'),
    encodePng(sheet.canvas),
  ]);
  const zip = new JSZip();
  zip.file('character-spritesheet.png', png);
  zip.file(
    'credits/credits.txt',
    creditsToTxt(sheet.credits, animation),
    { createFolders: false },
  );
  zip.file(
    'credits/credits.csv',
    creditsToCsv(sheet.credits, animation),
    { createFolders: false },
  );
  return zip.generateAsync({ type: 'blob' });
}
