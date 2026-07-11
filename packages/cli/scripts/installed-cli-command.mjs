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

export function isExpectedWebTermination({ code, signal }) {
  return (
    (code === 143 && signal === null) ||
    (code === null && signal === 'SIGTERM')
  );
}
