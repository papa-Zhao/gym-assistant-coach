interface ConfirmRowProps {
  label: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A sentence, then two equal-width buttons on one row. */
export function ConfirmRow({
  label,
  message,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmRowProps) {
  return (
    <div className="confirm-row" role="group" aria-label={label}>
      <span>{message}</span>
      <div className="confirm-actions">
        <button type="button" disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
