import JSZip from 'jszip';

const zipCache = new Map<string, JSZip>();
const downloadPromises = new Map<string, Promise<JSZip>>();

export function clearZipCacheForTests(): void {
  zipCache.clear();
  downloadPromises.clear();
}

export async function loadFileFromZip(path: string, baseHref: string): Promise<string> {
  const cleanPath = path.replace(/^spritesheets\//, '');
  const parts = cleanPath.split('/');
  const category = parts[0];
  const subPath = parts.slice(1).join('/');

  let zip = zipCache.get(category);
  if (!zip) {
    let promise = downloadPromises.get(category);
    if (!promise) {
      promise = (async () => {
        const zipUrl = new URL(`zips/${category}.zip`, baseHref).href;
        const res = await fetch(zipUrl);
        if (!res.ok) {
          throw new Error(`Failed to download ZIP: ${zipUrl} (HTTP ${res.status})`);
        }
        const buffer = await res.arrayBuffer();
        const newZip = await JSZip.loadAsync(buffer);
        zipCache.set(category, newZip);
        return newZip;
      })();
      downloadPromises.set(category, promise);
    }
    zip = await promise;
  }

  const file = zip.file(subPath);
  if (!file) {
    throw new Error(`File ${subPath} not found in zip archive ${category}.zip`);
  }

  const blob = await file.async('blob');
  return URL.createObjectURL(blob);
}
