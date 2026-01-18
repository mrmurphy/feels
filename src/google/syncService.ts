import { db, importData, getSettings, updateSettings } from '../db';
import { findBackupFile, uploadBackup, downloadBackup } from './driveApi';
import type {
  BackupFile,
  ConflictResolution,
  SyncResult,
} from './types';
import type { Stat, Entry } from '../types';

function generateChecksum(data: { stats: Stat[]; entries: Entry[] }): string {
  const str = JSON.stringify({
    stats: data.stats.map((s) => ({
      id: s.id,
      name: s.name,
      updatedAt: s.updatedAt,
    })),
    entries: data.entries.map((e) => ({
      id: e.id,
      value: e.value,
      updatedAt: e.updatedAt,
    })),
  });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

async function buildBackupFile(): Promise<BackupFile> {
  const stats = await db.stats.toArray();
  const entries = await db.entries.toArray();

  return {
    metadata: {
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      entryCount: entries.length,
      statCount: stats.length,
      checksum: generateChecksum({ stats, entries }),
    },
    data: { stats, entries },
  };
}

function mergeData(local: BackupFile, cloud: BackupFile): BackupFile {
  const mergedStats = new Map<number, Stat>();
  const mergedEntries = new Map<number, Entry>();

  cloud.data.stats.forEach((s) => s.id && mergedStats.set(s.id, s));
  cloud.data.entries.forEach((e) => e.id && mergedEntries.set(e.id, e));

  local.data.stats.forEach((s) => {
    if (!s.id) return;
    const existing = mergedStats.get(s.id);
    if (!existing || new Date(s.updatedAt) > new Date(existing.updatedAt)) {
      mergedStats.set(s.id, s);
    }
  });

  local.data.entries.forEach((e) => {
    if (!e.id) return;
    const existing = mergedEntries.get(e.id);
    if (!existing || new Date(e.updatedAt) > new Date(existing.updatedAt)) {
      mergedEntries.set(e.id, e);
    }
  });

  const stats = Array.from(mergedStats.values());
  const entries = Array.from(mergedEntries.values());

  return {
    metadata: {
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      entryCount: entries.length,
      statCount: stats.length,
      checksum: generateChecksum({ stats, entries }),
    },
    data: { stats, entries },
  };
}

async function resolveConflict(
  accessToken: string,
  fileId: string,
  localBackup: BackupFile,
  cloudBackup: BackupFile,
  resolution: ConflictResolution
): Promise<SyncResult> {
  switch (resolution) {
    case 'keep-local':
      await uploadBackup(accessToken, localBackup, fileId);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncChecksum: localBackup.metadata.checksum,
      });
      return { status: 'success', message: 'Local data uploaded to cloud' };

    case 'use-cloud':
      await importData(
        JSON.stringify({
          stats: cloudBackup.data.stats,
          entries: cloudBackup.data.entries,
          exportedAt: cloudBackup.metadata.exportedAt,
        })
      );
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncChecksum: cloudBackup.metadata.checksum,
      });
      return { status: 'success', message: 'Cloud data restored to device' };

    case 'merge': {
      const merged = mergeData(localBackup, cloudBackup);
      await importData(
        JSON.stringify({
          stats: merged.data.stats,
          entries: merged.data.entries,
          exportedAt: new Date().toISOString(),
        })
      );
      const newBackup = await buildBackupFile();
      await uploadBackup(accessToken, newBackup, fileId);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncChecksum: newBackup.metadata.checksum,
      });
      return { status: 'success', message: 'Data merged successfully' };
    }
  }
}

export async function performSync(
  accessToken: string,
  conflictResolution?: ConflictResolution
): Promise<SyncResult> {
  try {
    const settings = await getSettings();
    const localBackup = await buildBackupFile();
    const existingFile = await findBackupFile(accessToken);

    // No cloud backup exists - just upload
    if (!existingFile) {
      const fileId = await uploadBackup(accessToken, localBackup);
      await updateSettings({
        driveFileId: fileId,
        lastSyncTime: new Date().toISOString(),
        lastSyncChecksum: localBackup.metadata.checksum,
      });
      return { status: 'success', message: 'Backup created in Google Drive' };
    }

    // Cloud backup exists - check for conflicts
    const cloudBackup = await downloadBackup(accessToken, existingFile.id);

    // Same checksum - no changes needed
    if (cloudBackup.metadata.checksum === localBackup.metadata.checksum) {
      await updateSettings({
        driveFileId: existingFile.id,
        lastSyncTime: new Date().toISOString(),
      });
      return { status: 'no-changes', message: 'Data is already in sync' };
    }

    // Check if only local changed (cloud matches last sync)
    if (settings.lastSyncChecksum === cloudBackup.metadata.checksum) {
      await uploadBackup(accessToken, localBackup, existingFile.id);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncChecksum: localBackup.metadata.checksum,
      });
      return { status: 'success', message: 'Backup updated in Google Drive' };
    }

    // Both local and cloud changed - conflict!
    if (!conflictResolution) {
      return {
        status: 'conflict',
        message: 'Both local and cloud data have changed',
        cloudBackup,
        localBackup,
      };
    }

    return await resolveConflict(
      accessToken,
      existingFile.id,
      localBackup,
      cloudBackup,
      conflictResolution
    );
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown sync error',
    };
  }
}
