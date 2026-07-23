export type AssetPackSha256 = `sha256:${string}`;

export interface InflateRawBoundedOptions {
  readonly compressed: Uint8Array;
  readonly declaredSize: number;
  readonly maximumSize: number;
}

export interface AssetPackFormatRuntime {
  readonly sha256: (bytes: Uint8Array) => Promise<AssetPackSha256>;
  readonly decodeUtf8Fatal: (bytes: Uint8Array) => string;
  readonly encodeUtf8: (value: string) => Uint8Array;
  readonly inflateRawBounded: (
    options: InflateRawBoundedOptions,
  ) => Promise<Uint8Array>;
}
