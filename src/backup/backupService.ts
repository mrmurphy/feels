import { db, importData, getSettings, updateSettings } from '../db';
import { getBackup, putBackup } from './api';
import type { BackupFile, ConflictResolution, SyncResult } from './types';
import type { Stat, Entry, Event } from '../types';

function toIsoString(value: unknown): string {
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeStats(stats: Stat[]) {
  return [...stats]
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((s) => ({
      id: s.id ?? null,
      name: s.name,
      color: s.color,
      order: s.order,
      createdAt: toIsoString(s.createdAt),
      updatedAt: toIsoString(s.updatedAt),
    }));
}

function normalizeEntries(entries: Entry[]) {
  return [...entries]
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((e) => ({
      id: e.id ?? null,
      statId: e.statId,
      value: e.value,
      date: e.date,
      createdAt: toIsoString(e.createdAt),
      updatedAt: toIsoString(e.updatedAt),
    }));
}

function normalizeEvents(events: Event[]) {
  return [...events]
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((ev) => ({
      id: ev.id ?? null,
      name: ev.name,
      icon: ev.icon,
      note: ev.note ?? null,
      date: ev.date,
      createdAt: toIsoString(ev.createdAt),
      updatedAt: toIsoString(ev.updatedAt),
    }));
}

function getEvents(backup: BackupFile): Event[] {
  return (backup.data as { events?: Event[] }).events ?? [];
}

function hasSameData(localBackup: BackupFile, cloudBackup: BackupFile): boolean {
  const localEvents = getEvents(localBackup);
  const cloudEvents = getEvents(cloudBackup);
  const localComparable = {
    stats: normalizeStats(localBackup.data.stats),
    entries: normalizeEntries(localBackup.data.entries),
    events: normalizeEvents(localEvents),
  };
  const cloudComparable = {
    stats: normalizeStats(cloudBackup.data.stats),
    entries: normalizeEntries(cloudBackup.data.entries),
    events: normalizeEvents(cloudEvents),
  };
  return JSON.stringify(localComparable) === JSON.stringify(cloudComparable);
}

function hasCloudCursor(backup: BackupFile): boolean {
  return Number.isFinite((backup.metadata as { cursor?: unknown }).cursor);
}

function getCloudCursor(backup: BackupFile): number {
  if (!hasCloudCursor(backup)) return 0;
  return (backup.metadata as { cursor: number }).cursor;
}

function isValidBackupFile(raw: unknown): raw is BackupFile {
  if (!raw || typeof raw !== 'object') return false;
  const backup = raw as BackupFile;
  return Boolean(backup.metadata && backup.data?.stats && backup.data?.entries);
}

export async function buildBackupFile(cursor = 0): Promise<BackupFile> {
  const stats = await db.stats.toArray();
  const entries = await db.entries.toArray();
  const events = await db.events.toArray();

  return {
    metadata: {
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      entryCount: entries.length,
      statCount: stats.length,
      eventCount: events.length,
      cursor,
    },
    data: { stats, entries, events },
  };
}

function mergeData(local: BackupFile, cloud: BackupFile): { stats: Stat[]; entries: Entry[]; events: Event[] } {
  const mergedStats = new Map<number, Stat>();
  const mergedEntries = new Map<number, Entry>();
  const mergedEvents = new Map<number, Event>();

  cloud.data.stats.forEach((s) => s.id && mergedStats.set(s.id, s));
  cloud.data.entries.forEach((e) => e.id && mergedEntries.set(e.id, e));
  getEvents(cloud).forEach((ev) => ev.id && mergedEvents.set(ev.id, ev));

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

  getEvents(local).forEach((ev) => {
    if (!ev.id) return;
    const existing = mergedEvents.get(ev.id);
    if (!existing || new Date(ev.updatedAt) > new Date(existing.updatedAt)) {
      mergedEvents.set(ev.id, ev);
    }
  });

  return {
    stats: Array.from(mergedStats.values()),
    entries: Array.from(mergedEntries.values()),
    events: Array.from(mergedEvents.values()),
  };
}

async function resolveConflict(
  localBackup: BackupFile,
  cloudBackup: BackupFile,
  resolution: ConflictResolution,
  cloudCursor: number,
  keepalive?: boolean
): Promise<SyncResult> {
  const putOptions = keepalive ? { keepalive: true } : undefined;
  switch (resolution) {
    case 'keep-local': {
      const backupToPush = await buildBackupFile(cloudCursor + 1);
      await putBackup(backupToPush, putOptions);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: backupToPush.metadata.cursor,
      });
      return { status: 'success', message: 'Backup updated in cloud' };
    }

    case 'use-cloud':
      await importData(
        JSON.stringify({
          stats: cloudBackup.data.stats,
          entries: cloudBackup.data.entries,
          events: getEvents(cloudBackup),
          exportedAt: cloudBackup.metadata.exportedAt,
        })
      );
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: cloudCursor,
      });
      return { status: 'success', message: 'Restored from cloud backup' };

    case 'merge': {
      const merged = mergeData(localBackup, cloudBackup);
      await importData(
        JSON.stringify({
          stats: merged.stats,
          entries: merged.entries,
          events: merged.events,
          exportedAt: new Date().toISOString(),
        })
      );
      const newBackup = await buildBackupFile(cloudCursor + 1);
      await putBackup(newBackup, putOptions);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: newBackup.metadata.cursor,
      });
      return { status: 'success', message: 'Data merged successfully' };
    }
  }
}

export async function performSync(
  conflictResolution?: ConflictResolution,
  options?: { keepalive?: boolean }
): Promise<SyncResult> {
  const putOptions = options?.keepalive ? { keepalive: true } : undefined;
  try {
    const settings = await getSettings();
    const localBackup = await buildBackupFile();
    const cloudRaw = await getBackup();

    if (!cloudRaw) {
      const initialCursor = Math.max(settings.lastSyncCursor ?? 0, 0) + 1;
      const firstBackup = await buildBackupFile(initialCursor);
      await putBackup(firstBackup, putOptions);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: firstBackup.metadata.cursor,
      });
      return { status: 'success', message: 'Backup created in cloud' };
    }

    if (!isValidBackupFile(cloudRaw)) {
      const initialCursor = Math.max(settings.lastSyncCursor ?? 0, 0) + 1;
      const firstBackup = await buildBackupFile(initialCursor);
      await putBackup(firstBackup, putOptions);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: firstBackup.metadata.cursor,
      });
      return { status: 'success', message: 'Backup created in cloud' };
    }

    const cloudBackup = cloudRaw;
    const cloudCursor = getCloudCursor(cloudBackup);
    const lastSyncCursor = settings.lastSyncCursor ?? 0;

    if (hasSameData(localBackup, cloudBackup)) {
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: cloudCursor,
      });
      return { status: 'no-changes', message: 'Data is already in sync' };
    }

    if (!hasCloudCursor(cloudBackup)) {
      if (!conflictResolution) {
        return {
          status: 'conflict',
          message: 'Cloud backup format is outdated. Choose how to resolve.',
          cloudBackup,
          localBackup,
        };
      }
      return resolveConflict(localBackup, cloudBackup, conflictResolution, 0);
    }

    if (lastSyncCursor === cloudCursor) {
      const nextBackup = await buildBackupFile(cloudCursor + 1);
      await putBackup(nextBackup, putOptions);
      await updateSettings({
        lastSyncTime: new Date().toISOString(),
        lastSyncCursor: nextBackup.metadata.cursor,
      });
      return { status: 'success', message: 'Backup updated in cloud' };
    }

    if (!conflictResolution) {
      return {
        status: 'conflict',
        message: 'Both local and cloud data have changed',
        cloudBackup,
        localBackup,
      };
    }

    return resolveConflict(localBackup, cloudBackup, conflictResolution, cloudCursor, options?.keepalive);
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown sync error',
    };
  }
}
