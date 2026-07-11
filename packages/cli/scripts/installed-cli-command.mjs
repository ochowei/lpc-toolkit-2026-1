export function installedCliInvocation({
  platform,
  nodePath,
  shimPath,
  targetPath,
  args,
}) {
  return platform === 'win32'
    ? { command: nodePath, args: [targetPath, ...args] }
    : { command: shimPath, args };
}
