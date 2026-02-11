import type { ConflictResolution } from '../backup/types';

interface ConflictDialogProps {
  cloudDate?: string;
  localEntryCount?: number;
  cloudEntryCount?: number;
  onResolve: (resolution: ConflictResolution) => void;
  onCancel: () => void;
}

export function ConflictDialog({
  cloudDate,
  localEntryCount,
  cloudEntryCount,
  onResolve,
  onCancel,
}: ConflictDialogProps) {
  return (
    <div className="conflict-modal" role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-desc">
      <div className="conflict-content">
        <p className="conflict-eyebrow">backup</p>
        <h2 id="conflict-title" className="conflict-title">Sync conflict</h2>
        <p id="conflict-desc" className="conflict-description">
          Your device and cloud backup have both changed. Choose how to resolve.
        </p>

        <div className="conflict-comparison" aria-hidden="true">
          <div className="conflict-option conflict-option-local">
            <span className="conflict-option-label">This device</span>
            <span className="conflict-option-count">{localEntryCount ?? 0} entries</span>
          </div>
          <span className="conflict-vs" aria-hidden="true">vs</span>
          <div className="conflict-option conflict-option-cloud">
            <span className="conflict-option-label">Cloud backup</span>
            <span className="conflict-option-count">{cloudEntryCount ?? 0} entries</span>
            {cloudDate && (
              <span className="conflict-option-meta">
                {new Date(cloudDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        <div className="conflict-actions">
          <button
            type="button"
            className="conflict-btn conflict-btn-keep-local"
            onClick={() => onResolve('keep-local')}
          >
            <span className="conflict-btn-text">Keep this device</span>
            <span className="conflict-btn-hint">Overwrite cloud with current data</span>
          </button>
          <button
            type="button"
            className="conflict-btn conflict-btn-use-cloud"
            onClick={() => onResolve('use-cloud')}
          >
            <span className="conflict-btn-text">Use cloud backup</span>
            <span className="conflict-btn-hint">Replace this device with cloud data</span>
          </button>
          <button
            type="button"
            className="conflict-btn conflict-btn-merge"
            onClick={() => onResolve('merge')}
          >
            <span className="conflict-btn-text">Merge both</span>
            <span className="conflict-btn-hint">Combine and keep newest versions</span>
          </button>
          <button type="button" className="conflict-btn conflict-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
