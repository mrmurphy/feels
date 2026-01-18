import type { Stat, Entry } from '../types';

export interface GoogleAuthState {
  accessToken: string | null;
  expiresAt: number | null;
  userEmail: string | null;
  userPicture: string | null;
}

export interface BackupMetadata {
  version: 1;
  exportedAt: string;
  appVersion: string;
  entryCount: number;
  statCount: number;
  checksum: string;
}

export interface BackupFile {
  metadata: BackupMetadata;
  data: {
    stats: Stat[];
    entries: Entry[];
  };
}

export interface SyncState {
  lastSyncTime: string | null;
  lastSyncChecksum: string | null;
  driveFileId: string | null;
  syncEnabled: boolean;
}

export type ConflictResolution = 'keep-local' | 'use-cloud' | 'merge';

export interface SyncResult {
  status: 'success' | 'conflict' | 'no-changes' | 'error';
  message: string;
  cloudBackup?: BackupFile;
  localBackup?: BackupFile;
}
