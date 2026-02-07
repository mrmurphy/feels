import { useState, useEffect, useCallback } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  getRegisterOptions,
  verifyRegistration,
  getLoginOptions,
  verifyLogin,
  checkSession,
  logout as apiLogout,
} from '../backup/api';
import { performSync } from '../backup/backupService';
import { updateSettings } from '../db';
import { ConflictDialog } from './ConflictDialog';
import type { Settings } from '../types';
import type { ConflictResolution, SyncResult } from '../backup/types';

const BACKUP_SESSION_KEY = 'feels-backup-session';

function getStoredSession(): boolean {
  try {
    return !!localStorage.getItem(BACKUP_SESSION_KEY);
  } catch {
    return false;
  }
}

function getStoredUsername(): string | null {
  try {
    const u = localStorage.getItem(BACKUP_SESSION_KEY);
    return u && u.length > 0 ? u : null;
  } catch {
    return null;
  }
}

function setStoredSession(username: string) {
  try {
    localStorage.setItem(BACKUP_SESSION_KEY, username);
  } catch {
    // ignore
  }
}

function clearStoredSession() {
  try {
    localStorage.removeItem(BACKUP_SESSION_KEY);
  } catch {
    // ignore
  }
}

interface BackupSectionProps {
  settings: Settings;
}

export function BackupSection({ settings }: BackupSectionProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() =>
    getStoredSession() ? true : null
  );
  const [username, setUsername] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [syncStatus, setSyncStatus] = useState<
    'idle' | 'syncing' | 'success' | 'error'
  >('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [conflictResult, setConflictResult] = useState<SyncResult | null>(null);

  const refreshSession = useCallback(async () => {
    if (!getStoredSession()) {
      setIsAuthenticated(false);
      return;
    }
    try {
      const ok = await checkSession();
      if (!ok) {
        clearStoredSession();
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(true);
      }
    } catch {
      // Keep logged-in state when offline / request fails
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const options = await getRegisterOptions(u);
      const attestation = await startRegistration({
        optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'],
      });
      await verifyRegistration(u, attestation);
      setStoredSession(u);
      setIsAuthenticated(true);
      setUsername('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    setAuthLoading(true);
    setAuthError('');
    try {
      const options = await getLoginOptions(u);
      const assertion = await startAuthentication({
        optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      });
      await verifyLogin(u, assertion);
      setStoredSession(u);
      setIsAuthenticated(true);
      setUsername('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    setSyncMessage('');
    try {
      const result = await performSync();
      if (result.status === 'conflict') {
        setConflictResult(result);
        setSyncStatus('idle');
      } else if (result.status === 'error') {
        if (result.message.toLowerCase().includes('401') || result.message.toLowerCase().includes('unauthorized')) {
          clearStoredSession();
          setIsAuthenticated(false);
        }
        setSyncStatus('error');
        setSyncMessage(result.message);
      } else {
        setSyncStatus('success');
        setSyncMessage(result.message);
        setTimeout(() => setSyncStatus('idle'), 3000);
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  const handleConflictResolution = async (resolution: ConflictResolution) => {
    setConflictResult(null);
    setSyncStatus('syncing');
    try {
      const result = await performSync(resolution);
      if (result.status === 'success') {
        setSyncStatus('success');
        setSyncMessage(result.message);
        setTimeout(() => setSyncStatus('idle'), 3000);
      } else {
        setSyncStatus('error');
        setSyncMessage(result.message);
      }
    } catch (err) {
      setSyncStatus('error');
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  const handleToggleSync = async (enabled: boolean) => {
    await updateSettings({ syncEnabled: enabled });
    if (enabled && isAuthenticated) {
      handleManualSync();
    }
  };

  if (isAuthenticated === null) {
    return (
      <section className="settings-section">
        <h2 className="settings-title">backup</h2>
        <p className="sync-description">Checking session…</p>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h2 className="settings-title">backup</h2>

      {!isAuthenticated ? (
        <div className="sync-signin">
          <p className="sync-description">
            Back up your data with ittybittybackup. Sign in with a passkey
            (no password).
          </p>
          <form
            onSubmit={(e) => e.preventDefault()}
            className="backup-auth-form"
          >
            <input
              type="text"
              autoComplete="username"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="backup-username-input"
              disabled={authLoading}
            />
            <div className="backup-auth-buttons">
              <button
                type="button"
                className="sync-signin-btn"
                onClick={handleRegister}
                disabled={authLoading || !username.trim()}
              >
                {authLoading ? '…' : 'sign up'}
              </button>
              <button
                type="button"
                className="sync-signin-btn"
                onClick={handleLogin}
                disabled={authLoading || !username.trim()}
              >
                {authLoading ? '…' : 'log in'}
              </button>
            </div>
          </form>
          {authError && (
            <p className="sync-message error">{authError}</p>
          )}
        </div>
      ) : (
        <div className="sync-controls">
          <div className="sync-user">
            <span className="sync-user-email">
              {getStoredUsername() ? `Logged in as ${getStoredUsername()}` : 'Backup enabled'}
            </span>
            <button
              type="button"
              className="sync-signout"
              onClick={async () => {
                await apiLogout();
                clearStoredSession();
                setIsAuthenticated(false);
              }}
            >
              log out
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
            type="button"
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
