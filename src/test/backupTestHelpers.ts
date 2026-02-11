import { db } from '../db';
import { initializeDatabase, updateSettings } from '../db';
import type { Entry, Settings } from '../types';

/** Clear all Dexie tables to avoid cross-test leakage. */
export async function clearDb(): Promise<void> {
  await db.transaction('rw', [db.stats, db.entries, db.settings], async () => {
    await db.stats.clear();
    await db.entries.clear();
    await db.settings.clear();
  });
}

/** Ensure minimal app state: one stat, one settings row. Call after clearDb(). */
export async function seedMinimal(): Promise<{ statId: number }> {
  await initializeDatabase();
  const stat = await db.stats.toCollection().first();
  if (!stat?.id) throw new Error('seedMinimal: expected one stat');
  return { statId: stat.id };
}

/** Update settings (e.g. lastSyncCursor). Requires at least one settings row; use seedMinimal() first. */
export async function setSettings(updates: Partial<Settings>): Promise<void> {
  await updateSettings(updates);
}

/** Add one entry with deterministic date. Returns created entry id. */
export async function seedEntry(statId: number, value: number, date: string): Promise<number> {
  const id = await db.entries.add({
    statId,
    value,
    date,
  } as Entry);
  return id as number;
}

/** Get current settings (first row). */
export async function getSettingsSnapshot(): Promise<Settings | undefined> {
  return db.settings.toCollection().first();
}
