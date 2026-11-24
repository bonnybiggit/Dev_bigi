import Modal from "./Modal";
export default function ConfirmationDialog({
  title,
  description,
  busy,
  error,
  onClose,
  onConfirm,
}) {
  return (
    <Modal
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <p className="muted">{description}</p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button className="btn secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
