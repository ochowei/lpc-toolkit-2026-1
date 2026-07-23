export function canonicalizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonValue);
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const val = record[key];
    if (val !== undefined) {
      result[key] = canonicalizeJsonValue(val);
    }
  }
  return result;
}

export function encodeCanonicalJson(value: unknown, encodeUtf8: (text: string) => Uint8Array): Uint8Array {
  const canonical = canonicalizeJsonValue(value);
  const jsonText = `${JSON.stringify(canonical, null, 2)}\n`;
  return encodeUtf8(jsonText);
}
