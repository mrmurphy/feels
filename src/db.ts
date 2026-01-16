import Dexie, { type EntityTable } from 'dexie';
import type { Stat, Entry, Settings } from './types';
export type { Settings } from './types';

const db = new Dexie('FeelsDB') as Dexie & {
  stats: EntityTable<Stat, 'id'>;
  entries: EntityTable<Entry, 'id'>;
  settings: EntityTable<Settings, 'id'>;
};

db.version(1).stores({
  stats: '++id, name, order, createdAt',
  entries: '++id, statId, date, createdAt',
  settings: '++id',
});

// Auto-timestamp hooks
const tables = [db.stats, db.entries, db.settings];
tables.forEach((table) => {
  table.hook('creating', (_primKey, obj) => {
    obj.createdAt = new Date();
    obj.updatedAt = new Date();
  });
  table.hook('updating', (modifications) => {
    return { ...modifications, updatedAt: new Date() };
  });
});

// Default stat colors - warm, journal-like palette
const DEFAULT_COLORS = [
  '#e07a5f', // terra cotta
  '#3d405b', // charcoal blue
  '#81b29a', // sage
  '#f2cc8f', // sand
  '#9a8c98', // dusty purple
  '#c9ada7', // dusty rose
  '#577590', // steel blue
  '#f4a261', // sandy orange
];

export const DEFAULT_SETTINGS = {
  daysToShow: 14,
};

export async function initializeDatabase() {
  const statCount = await db.stats.count();
  if (statCount === 0) {
    // Create a default stat to get started
    await db.stats.add({
      name: 'mood',
      color: DEFAULT_COLORS[0],
      order: 0,
    } as Stat);
  }

  // Initialize settings if not present
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.add({
      daysToShow: DEFAULT_SETTINGS.daysToShow,
    } as Settings);
  }
}

export async function getSettings(): Promise<Settings> {
  const settings = await db.settings.toCollection().first();
  return settings || ({ daysToShow: DEFAULT_SETTINGS.daysToShow } as Settings);
}

export async function updateSettings(updates: Partial<Settings>): Promise<void> {
  const settings = await db.settings.toCollection().first();
  if (settings?.id) {
    await db.settings.update(settings.id, updates);
  }
}

// Generate test data for development
export async function generateTestData() {
  // Clear existing data
  await db.transaction('rw', [db.stats, db.entries], async () => {
    await db.stats.clear();
    await db.entries.clear();

    // Create test stats
    const moodId = await db.stats.add({ name: 'mood', color: DEFAULT_COLORS[0], order: 0 } as Stat) as number;
    const energyId = await db.stats.add({ name: 'energy', color: DEFAULT_COLORS[2], order: 1 } as Stat) as number;
    const focusId = await db.stats.add({ name: 'focus', color: DEFAULT_COLORS[4], order: 2 } as Stat) as number;

    // Generate entries for the last 30 days
    const today = new Date();
    const entries: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>[] = [];

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      // Add entries with some variation
      // Mood: fluctuates between 4-8
      if (Math.random() > 0.2) {
        entries.push({
          statId: moodId,
          value: Math.floor(4 + Math.random() * 5),
          date: dateStr,
        });
      }

      // Energy: generally lower, 3-7
      if (Math.random() > 0.3) {
        entries.push({
          statId: energyId,
          value: Math.floor(3 + Math.random() * 5),
          date: dateStr,
        });
      }

      // Focus: varies more, 2-9
      if (Math.random() > 0.4) {
        entries.push({
          statId: focusId,
          value: Math.floor(2 + Math.random() * 8),
          date: dateStr,
        });
      }

      // Sometimes add multiple entries per day for the same stat (recent days)
      if (i < 7 && Math.random() > 0.6) {
        entries.push({
          statId: moodId,
          value: Math.floor(5 + Math.random() * 4),
          date: dateStr,
        });
      }
    }

    // Add all entries
    for (const entry of entries) {
      await db.entries.add(entry as Entry);
    }
  });
}

export function getNextColor(existingStats: Stat[]): string {
  const usedColors = new Set(existingStats.map((s) => s.color));
  const available = DEFAULT_COLORS.find((c) => !usedColors.has(c));
  return available || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export async function exportData(): Promise<string> {
  const stats = await db.stats.toArray();
  const entries = await db.entries.toArray();
  return JSON.stringify({ stats, entries, exportedAt: new Date().toISOString() }, null, 2);
}

export async function importData(jsonString: string): Promise<void> {
  const data = JSON.parse(jsonString);

  await db.transaction('rw', [db.stats, db.entries], async () => {
    await db.stats.clear();
    await db.entries.clear();

    if (data.stats?.length) {
      // Restore with original IDs
      await db.stats.bulkAdd(
        data.stats.map((s: Stat) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        }))
      );
    }
    if (data.entries?.length) {
      await db.entries.bulkAdd(
        data.entries.map((e: Entry) => ({
          ...e,
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        }))
      );
    }
  });
}

// Expose test data generator to window for development
if (typeof window !== 'undefined') {
  (window as unknown as { generateTestData: typeof generateTestData }).generateTestData = generateTestData;
}

export { db, DEFAULT_COLORS };
