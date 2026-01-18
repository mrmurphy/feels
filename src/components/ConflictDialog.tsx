import type { ConflictResolution } from '../google/types';

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
    <div className="conflict-modal">
      <div className="conflict-content">
        <h3 className="conflict-title">sync conflict</h3>
        <p className="conflict-description">
          Your local data and cloud backup have both changed since the last
          sync.
        </p>

        <div className="conflict-comparison">
          <div className="conflict-option local">
            <strong>local device</strong>
            <span>{localEntryCount} entries</span>
          </div>
          <div className="conflict-option cloud">
            <strong>google drive</strong>
            <span>{cloudEntryCount} entries</span>
            {cloudDate && (
              <span>backed up: {new Date(cloudDate).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="conflict-actions">
          <button
            className="conflict-btn keep-local"
            onClick={() => onResolve('keep-local')}
          >
            keep local
            <span className="conflict-btn-hint">
              overwrite cloud with your device data
            </span>
          </button>

          <button
            className="conflict-btn use-cloud"
            onClick={() => onResolve('use-cloud')}
          >
            use cloud
            <span className="conflict-btn-hint">
              replace device data with cloud backup
            </span>
          </button>

          <button
            className="conflict-btn merge"
            onClick={() => onResolve('merge')}
          >
            merge both
            <span className="conflict-btn-hint">
              combine entries, keep newest versions
            </span>
          </button>

          <button className="conflict-btn cancel" onClick={onCancel}>
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}
