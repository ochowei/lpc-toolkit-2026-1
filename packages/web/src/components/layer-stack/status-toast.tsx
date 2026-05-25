interface Props {
  status: { kind: 'info' | 'warn' | 'error'; text: string } | null;
}

export function StatusToast({ status }: Props) {
  if (!status) return null;
  const ring =
    status.kind === 'warn'
      ? 'border-danger text-danger'
      : status.kind === 'error'
        ? 'border-danger text-danger'
        : 'border-border text-text';
  return (
    <div
      className={`mx-3 mt-2 rounded-md border bg-surface-2 px-2 py-1 text-[11px] ${ring}`}
      role="status"
    >
      {status.text}
    </div>
  );
}
