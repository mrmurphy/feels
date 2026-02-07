import { useEffect, useRef, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSettings } from '../db';
import { checkSession } from '../backup/api';
import { performSync } from '../backup/backupService';
import type { SyncResult } from '../backup/types';

const DEBOUNCE_MS = 5000;

export function useAutoSync(onConflict?: (result: SyncResult) => void) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFingerprintRef = useRef<string | null>(null);
  const isAuthenticatedRef = useRef<boolean>(false);

  const stats = useLiveQuery(() => db.stats.toArray());
  const entries = useLiveQuery(() => db.entries.toArray());

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine) return;

    try {
      const ok = await checkSession();
      isAuthenticatedRef.current = ok;
      if (!ok) return;
    } catch {
      return;
    }

    const settings = await getSettings();
    if (!settings.syncEnabled) return;

    const result = await performSync();

    if (result.status === 'conflict' && onConflict) {
      onConflict(result);
    }
  }, [onConflict]);

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

  useEffect(() => {
    const handleOnline = () => triggerSync();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [triggerSync]);

  return { triggerSync };
}
