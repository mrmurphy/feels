import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBackup, putBackup } from './api';
import { performSync, buildBackupFile } from './backupService';
import { clearDb, seedMinimal, setSettings, seedEntry, getSettingsSnapshot } from '../test/backupTestHelpers';
import type { BackupFile } from './types';

vi.mock('./api', () => ({
  getBackup: vi.fn(),
  putBackup: vi.fn(),
}));

const mockedGetBackup = vi.mocked(getBackup);
const mockedPutBackup = vi.mocked(putBackup);

describe('backup performSync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearDb();
  });

  it('creates cloud backup when none exists', async () => {
    await seedMinimal();
    mockedGetBackup.mockResolvedValue(null);
    mockedPutBackup.mockResolvedValue(undefined);

    const result = await performSync();

    expect(result.status).toBe('success');
    expect(mockedPutBackup).toHaveBeenCalledTimes(1);
    const pushed = mockedPutBackup.mock.calls[0]![0] as BackupFile;
    expect(pushed.metadata.cursor).toBe(1);
    const settings = await getSettingsSnapshot();
    expect(settings?.lastSyncCursor).toBe(1);
  });

  it('detects no changes when local and cloud data match', async () => {
    await seedMinimal();
    const cloudBackup = await buildBackupFile(2);
    mockedGetBackup.mockResolvedValue(cloudBackup);
    await setSettings({ lastSyncCursor: 2 });

    const result = await performSync();

    expect(result.status).toBe('no-changes');
    expect(mockedPutBackup).not.toHaveBeenCalled();
    const settings = await getSettingsSnapshot();
    expect(settings?.lastSyncCursor).toBe(2);
  });

  it('pushes local when base cursor matches cloud cursor', async () => {
    const { statId } = await seedMinimal();
    const cloudBackup = await buildBackupFile(1);
    await setSettings({ lastSyncCursor: 1 });
    await seedEntry(statId, 5, '2025-02-10');
    mockedGetBackup.mockResolvedValue(cloudBackup);
    mockedPutBackup.mockResolvedValue(undefined);

    const result = await performSync();

    expect(result.status).toBe('success');
    expect(mockedPutBackup).toHaveBeenCalledTimes(1);
    const pushed = mockedPutBackup.mock.calls[0]![0] as BackupFile;
    expect(pushed.metadata.cursor).toBe(2);
    const settings = await getSettingsSnapshot();
    expect(settings?.lastSyncCursor).toBe(2);
  });

  it('returns conflict when cloud advanced beyond local base cursor', async () => {
    const { statId } = await seedMinimal();
    await seedEntry(statId, 1, '2025-02-09');
    const cloudBackup = await buildBackupFile(3);
    await setSettings({ lastSyncCursor: 1 });
    await seedEntry(statId, 2, '2025-02-10');
    mockedGetBackup.mockResolvedValue(cloudBackup);

    const result = await performSync();

    expect(result.status).toBe('conflict');
    expect(result.message).toContain('Both local and cloud');
    expect(mockedPutBackup).not.toHaveBeenCalled();
  });

  it('keep-local resolution pushes incremented cursor and updates local cursor', async () => {
    const { statId } = await seedMinimal();
    await seedEntry(statId, 1, '2025-02-09');
    const cloudBackup = await buildBackupFile(3);
    await setSettings({ lastSyncCursor: 1 });
    await seedEntry(statId, 2, '2025-02-10');
    mockedGetBackup.mockResolvedValue(cloudBackup);
    mockedPutBackup.mockResolvedValue(undefined);

    const result = await performSync('keep-local');

    expect(result.status).toBe('success');
    expect(mockedPutBackup).toHaveBeenCalledTimes(1);
    const pushed = mockedPutBackup.mock.calls[0]![0] as BackupFile;
    expect(pushed.metadata.cursor).toBe(4);
    const settings = await getSettingsSnapshot();
    expect(settings?.lastSyncCursor).toBe(4);
  });

  it('use-cloud resolution imports cloud data and updates local cursor', async () => {
    const { statId } = await seedMinimal();
    await seedEntry(statId, 99, '2025-02-08');
    const cloudBackup = await buildBackupFile(5);
    await setSettings({ lastSyncCursor: 2 });
    await seedEntry(statId, 1, '2025-02-10');
    mockedGetBackup.mockResolvedValue(cloudBackup);

    const result = await performSync('use-cloud');

    expect(result.status).toBe('success');
    const settings = await getSettingsSnapshot();
    expect(settings?.lastSyncCursor).toBe(5);
    const { db } = await import('../db');
    const entries = await db.entries.toArray();
    expect(entries.length).toBe(1);
    expect(entries[0]!.value).toBe(99);
  });

  it('merge resolution merges by updatedAt, pushes incremented cursor, persists cursor', async () => {
    const { statId } = await seedMinimal();
    await seedEntry(statId, 1, '2025-02-09');
    const cloudBackup = await buildBackupFile(2);
    await setSettings({ lastSyncCursor: 1 });
    await seedEntry(statId, 2, '2025-02-10');
    mockedGetBackup.mockResolvedValue(cloudBackup);
    mockedPutBackup.mockResolvedValue(undefined);

    const result = await performSync('merge');

    expect(result.status).toBe('success');
    expect(mockedPutBackup).toHaveBeenCalledTimes(1);
    const pushed = mockedPutBackup.mock.calls[0]![0] as BackupFile;
    expect(pushed.metadata.cursor).toBe(3);
    const settings = await getSettingsSnapshot();
    expect(settings?.lastSyncCursor).toBe(3);
  });

  it('returns conflict for legacy cloud backup without cursor when data differs', async () => {
    const { statId } = await seedMinimal();
    await seedEntry(statId, 7, '2025-02-10');
    const legacyCloud: unknown = {
      metadata: {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: '1.0.0',
        entryCount: 0,
        statCount: 1,
      },
      data: {
        stats: [
          {
            id: 1,
            name: 'mood',
            color: '#e07a5f',
            order: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        entries: [],
      },
    };
    mockedGetBackup.mockResolvedValue(legacyCloud);
    await setSettings({ lastSyncCursor: 0 });

    const result = await performSync();

    expect(result.status).toBe('conflict');
    expect(result.message).toContain('outdated');
    expect(mockedPutBackup).not.toHaveBeenCalled();
  });
});
