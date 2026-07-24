import type {
  AssetPackFormatRuntime,
  AssetPackSha256,
} from '@lpc-toolkit/asset-pack-format';

export class AssetPackBrowserCapabilityError extends Error {
  readonly code = 'asset_browser_capability_missing' as const;

  constructor(capability: string) {
    super(`Browser capability is unavailable: ${capability}.`);
    this.name = 'AssetPackBrowserCapabilityError';
  }
}

interface BrowserAssetPackFormatRuntimeOptions {
  readonly crypto?: Crypto | null;
  readonly createDecompressionStream?: (
    format: CompressionFormat,
  ) => DecompressionStream;
}

export function createBrowserAssetPackFormatRuntime(
  options: BrowserAssetPackFormatRuntimeOptions = {},
): AssetPackFormatRuntime {
  const cryptoApi = options.crypto === undefined ? globalThis.crypto : options.crypto;
  const createStream = options.createDecompressionStream ?? ((format: CompressionFormat) => {
    if (typeof globalThis.DecompressionStream !== 'function') {
      throw new AssetPackBrowserCapabilityError('DecompressionStream');
    }
    return new globalThis.DecompressionStream(format);
  });

  return {
    sha256: async (bytes): Promise<AssetPackSha256> => {
      if (!cryptoApi?.subtle) throw new AssetPackBrowserCapabilityError('crypto.subtle');
      const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
      const hex = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
      return `sha256:${hex}`;
    },
    decodeUtf8Fatal: (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    encodeUtf8: (value) => new TextEncoder().encode(value),
    inflateRawBounded: async ({ compressed, declaredSize, maximumSize }) => {
      if (declaredSize < 0 || maximumSize < 0) throw new Error('Raw DEFLATE bounds must be non-negative.');
      let stream: DecompressionStream;
      try {
        stream = createStream('deflate-raw');
      } catch (error) {
        if (error instanceof AssetPackBrowserCapabilityError) throw error;
        throw new AssetPackBrowserCapabilityError('DecompressionStream(deflate-raw)');
      }
      const reader = stream.readable.getReader();
      const writer = stream.writable.getWriter();
      const chunks: Uint8Array[] = [];
      let total = 0;
      let readerCancelled = false;
      const cancelReader = async (reason: unknown): Promise<void> => {
        if (readerCancelled) return;
        readerCancelled = true;
        await reader.cancel(reason).catch(() => undefined);
      };
      const readOutput = async (): Promise<Uint8Array> => {
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            const chunk = next.value;
            if (total + chunk.byteLength > maximumSize) {
              await cancelReader('bounded output exceeded');
              throw new Error('Raw DEFLATE output exceeds the bounded output limit.');
            }
            total += chunk.byteLength;
            chunks.push(new Uint8Array(chunk));
          }
        } finally {
          reader.releaseLock();
        }
        if (total !== declaredSize) throw new Error('Raw DEFLATE output length does not match its declaration.');
        const output = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return output;
      };
      try {
        const outputPromise = readOutput();
        await writer.write(compressed);
        await writer.close();
        return await outputPromise;
      } catch (error) {
        await cancelReader(error);
        throw error;
      }
    },
  };
}
