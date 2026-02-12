import type { Stat, Entry, Event } from '../types';

export interface BackupMetadata {
  version: 1;
  exportedAt: string;
  appVersion: string;
  entryCount: number;
  statCount: number;
  eventCount?: number; // optional for backward compatibility with old backups
  cursor: number;
}

export interface BackupFile {
  metadata: BackupMetadata;
  data: {
    stats: Stat[];
    entries: Entry[];
    events: Event[];
  };
}

export type ConflictResolution = 'keep-local' | 'use-cloud' | 'merge';

export interface SyncResult {
  status: 'success' | 'conflict' | 'no-changes' | 'error';
  message: string;
  cloudBackup?: BackupFile;
  localBackup?: BackupFile;
}
