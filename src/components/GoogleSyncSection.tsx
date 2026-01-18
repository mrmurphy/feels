import { useState } from 'react';
import { useGoogleAuth } from '../google/GoogleAuthContext';
import { performSync } from '../google/syncService';
import { updateSettings } from '../db';
import { ConflictDialog } from './ConflictDialog';
import type { Settings } from '../types';
import type { ConflictResolution, SyncResult } from '../google/types';

interface GoogleSyncSectionProps {
  settings: Settings;
}

export function GoogleSyncSection({ settings }: GoogleSyncSectionProps) {
  const {
    isAuthenticated,
    isLoading,
    authState,
    login,
    logout,
    getValidAccessToken,
  } = useGoogleAuth();
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'success' | 'error'
  >('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [conflictResult, setConflictResult] = useState<SyncResult | null>(null);

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    const token = await getValidAccessToken();

    if (!token) {
      setSyncStatus('error');
      setSyncMessage('Please sign in again');
      return;
    }

    const result = await performSync(token);

    if (result.status === 'conflict') {
      setConflictResult(result);
      setSyncStatus('idle');
    } else if (result.status === 'error') {
      setSyncStatus('error');
      setSyncMessage(result.message);
    } else {
      setSyncStatus('success');
      setSyncMessage(result.message);
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const handleConflictResolution = async (resolution: ConflictResolution) => {
    setConflictResult(null);
    setSyncStatus('syncing');

    const token = await getValidAccessToken();
    if (!token) return;

    const result = await performSync(token, resolution);

    if (result.status === 'success') {
      setSyncStatus('success');
      setSyncMessage(result.message);
      setTimeout(() => setSyncStatus('idle'), 3000);
    } else {
      setSyncStatus('error');
      setSyncMessage(result.message);
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    await updateSettings({ syncEnabled: enabled });
    if (enabled && isAuthenticated) {
      handleManualSync();
    }
  };

  return (
    <section className="settings-section">
      <h2 className="settings-title">google drive sync</h2>

      {!isAuthenticated ? (
        <div className="sync-signin">
          <p className="sync-description">
            Back up your data to Google Drive. Your data stays private in a
            hidden app folder.
          </p>
          <button
            className="google-signin-btn"
            onClick={login}
            disabled={isLoading}
          >
            {isLoading ? 'signing in...' : 'sign in with google'}
          </button>
        </div>
      ) : (
        <div className="sync-controls">
          <div className="sync-user">
            {authState.userPicture && (
              <img
                src={authState.userPicture}
                alt=""
                className="sync-user-avatar"
              />
            )}
            <span className="sync-user-email">{authState.userEmail}</span>
            <button className="sync-signout" onClick={logout}>
              sign out
            </button>
          </div>

          <div className="sync-toggle">
            <label className="setting-label">auto-sync enabled</label>
            <input
              type="checkbox"
              checked={settings.syncEnabled ?? false}
              onChange={(e) => handleToggleSync(e.target.checked)}
            />
          </div>

          <button
            className="sync-now-btn"
            onClick={handleManualSync}
            disabled={syncStatus === 'syncing'}
          >
            {syncStatus === 'syncing' ? 'syncing...' : 'sync now'}
          </button>

          {settings.lastSyncTime && (
            <p className="sync-last-time">
              last synced: {new Date(settings.lastSyncTime).toLocaleString()}
            </p>
          )}

          {syncMessage && (
            <p className={`sync-message ${syncStatus}`}>{syncMessage}</p>
          )}
        </div>
      )}

      {conflictResult && (
        <ConflictDialog
          cloudDate={conflictResult.cloudBackup?.metadata.exportedAt}
          localEntryCount={conflictResult.localBackup?.metadata.entryCount}
          cloudEntryCount={conflictResult.cloudBackup?.metadata.entryCount}
          onResolve={handleConflictResolution}
          onCancel={() => setConflictResult(null)}
        />
      )}
    </section>
  );
}
