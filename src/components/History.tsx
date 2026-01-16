import { useState } from 'react';
import { db } from '../db';
import type { Stat, Entry } from '../types';

interface HistoryProps {
  stats: Stat[];
  entries: Entry[];
}

interface GroupedEntries {
  date: string;
  entries: Entry[];
}

function groupEntriesByDate(entries: Entry[]): GroupedEntries[] {
  const groups = new Map<string, Entry[]>();

  entries.forEach((entry) => {
    if (!groups.has(entry.date)) {
      groups.set(entry.date, []);
    }
    groups.get(entry.date)!.push(entry);
  });

  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // Newest first
    .map(([date, entries]) => ({ date, entries }));
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayStr = today.toISOString().split('T')[0];
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return 'today';
  if (dateStr === yesterdayStr) return 'yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function History({ stats, entries }: HistoryProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState(5);

  const grouped = groupEntriesByDate(entries);
  const statMap = new Map(stats.map((s) => [s.id, s]));

  const handleEdit = (entry: Entry) => {
    setEditingId(entry.id!);
    setEditValue(entry.value);
  };

  const handleSave = async () => {
    if (editingId === null) return;
    await db.entries.update(editingId, { value: editValue });
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    await db.entries.delete(id);
    setEditingId(null);
  };

  const handleCancel = () => {
    setEditingId(null);
  };

  if (entries.length === 0) {
    return (
      <div className="history empty">
        <p>no entries yet</p>
        <p className="history-empty-hint">record your first feeling above</p>
      </div>
    );
  }

  return (
    <div className="history">
      {grouped.map(({ date, entries: dayEntries }, groupIndex) => (
        <div
          key={date}
          className="history-group"
          style={{ '--stagger': groupIndex } as React.CSSProperties}
        >
          <h3 className="history-date">{formatDate(date)}</h3>
          <div className="history-entries">
            {dayEntries.map((entry, entryIndex) => {
              const stat = statMap.get(entry.statId);
              const isEditing = editingId === entry.id;

              return (
                <div
                  key={entry.id}
                  className={`history-entry ${isEditing ? 'editing' : ''}`}
                  style={{
                    '--stat-color': stat?.color || '#888',
                    '--stagger': entryIndex,
                  } as React.CSSProperties}
                >
                  <div className="entry-color" />
                  <div className="entry-content">
                    <span className="entry-stat">{stat?.name || 'unknown'}</span>
                    <span className="entry-time">{formatTime(entry.createdAt)}</span>
                  </div>

                  {isEditing ? (
                    <div className="entry-edit">
                      <input
                        type="range"
                        min="0"
                        max="10"
                        value={editValue}
                        onChange={(e) => setEditValue(Number(e.target.value))}
                        className="edit-slider"
                      />
                      <span className="edit-value">{editValue}</span>
                      <div className="edit-actions">
                        <button className="edit-btn save" onClick={handleSave}>
                          save
                        </button>
                        <button className="edit-btn cancel" onClick={handleCancel}>
                          cancel
                        </button>
                        <button
                          className="edit-btn delete"
                          onClick={() => handleDelete(entry.id!)}
                        >
                          delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="entry-value"
                      onClick={() => handleEdit(entry)}
                    >
                      {entry.value}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
