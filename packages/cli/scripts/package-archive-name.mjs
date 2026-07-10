/**
 * @param {{ readonly name?: unknown, readonly version?: unknown }} packageJson
 */
export function packedTarballName(packageJson) {
  const { name, version } = packageJson;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('package name must be a non-empty string');
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('package version must be a non-empty string');
  }

  const archiveName = name.startsWith('@') ? name.slice(1).replace('/', '-') : name;
  return `${archiveName}-${version}.tgz`;
}
