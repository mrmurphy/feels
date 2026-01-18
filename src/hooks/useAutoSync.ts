import { useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import { useGoogleAuth } from '../google/GoogleAuthContext';
import { performSync } from '../google/syncService';
import type { SyncResult } from '../google/types';

const DEBOUNCE_MS = 5000;

export function useAutoSync(onConflict?: (result: SyncResult) => void) {
  const { isAuthenticated, getValidAccessToken } = useGoogleAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFingerprintRef = useRef<string | null>(null);

  const stats = useLiveQuery(() => db.stats.toArray());
  const entries = useLiveQuery(() => db.entries.toArray());

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;
    if (!isAuthenticated) return;

    const settings = await getSettings();
    if (!settings.syncEnabled) return;

    const token = await getValidAccessToken();
    if (!token) return;

    const result = await performSync(token);

    if (result.status === 'conflict' && onConflict) {
      onConflict(result);
    }
  }, [isAuthenticated, getValidAccessToken, onConflict]);

  useEffect(() => {
    if (!stats || !entries) return;

    const fingerprint = `${stats.length}-${entries.length}-${
      entries[0]?.updatedAt?.toISOString() || ''
    }`;

    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(triggerSync, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [stats, entries, triggerSync]);

  // Sync on reconnect
  useEffect(() => {
    const handleOnline = () => triggerSync();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [triggerSync]);

  return { triggerSync };
}
