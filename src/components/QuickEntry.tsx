import { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getTodayDateString, DEFAULT_SETTINGS } from '../db';
import type { Stat, Settings } from '../types';

interface QuickEntryProps {
  stats: Stat[];
  settings: Settings;
}

export function QuickEntry({ stats, settings }: QuickEntryProps) {
  const [selectedStatId, setSelectedStatId] = useState<number | null>(null);
  const [value, setValue] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [now, setNow] = useState(Date.now());
  const sliderRef = useRef<HTMLInputElement>(null);

  // Query today's entries for count badges
  const todayEntries = useLiveQuery(
    () => db.entries.where('date').equals(getTodayDateString()).toArray(),
    []
  );

  // Compute count and most recent entry time per stat
  const statData = useMemo(() => {
    const map = new Map<number, { count: number; lastEntryTime: Date }>();
    todayEntries?.forEach((entry) => {
      const existing = map.get(entry.statId);
      if (!existing) {
        map.set(entry.statId, { count: 1, lastEntryTime: entry.createdAt });
      } else {
        existing.count++;
        if (entry.createdAt > existing.lastEntryTime) {
          existing.lastEntryTime = entry.createdAt;
        }
      }
    });
    return map;
  }, [todayEntries]);

  // Auto-select first stat if none selected
  useEffect(() => {
    if (selectedStatId === null && stats.length > 0) {
      setSelectedStatId(stats[0].id!);
    }
  }, [stats, selectedStatId]);

  // Update time periodically to refresh progress rings
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000); // Update every second
    return () => clearInterval(interval);
  }, []);

  const selectedStat = stats.find((s) => s.id === selectedStatId);

  const handleSubmit = async () => {
    if (!selectedStatId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await db.entries.add({
        statId: selectedStatId,
        value,
        date: getTodayDateString(),
      } as never);

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1000);
      setValue(5); // Reset to middle
    } finally {
      setIsSubmitting(false);
    }
  };

  if (stats.length === 0) {
    return (
      <div className="quick-entry empty">
        <p>add a stat in settings to get started</p>
      </div>
    );
  }

  return (
    <div className="quick-entry">
      <div className="stat-selector">
        {stats.map((stat) => {
          const data = statData.get(stat.id!);
          const count = data?.count ?? 0;
          const lastEntryTime = data?.lastEntryTime;

          // Calculate progress (0-1) based on time since last entry
          const refillMs = (settings.badgeRefillMinutes ?? DEFAULT_SETTINGS.badgeRefillMinutes) * 60 * 1000;
          const elapsed = lastEntryTime ? now - lastEntryTime.getTime() : refillMs;
          const progress = Math.min(elapsed / refillMs, 1);

          return (
            <button
              key={stat.id}
              className={`stat-chip ${selectedStatId === stat.id ? 'selected' : ''}`}
              style={{
                '--stat-color': stat.color,
              } as React.CSSProperties}
              onClick={() => setSelectedStatId(stat.id!)}
            >
              {stat.name}
              {count > 0 && (
                <span className="stat-count-badge">
                  <span
                    className="stat-count-ring"
                    style={{
                      background: `conic-gradient(currentColor 0% ${progress * 100}%, transparent ${progress * 100}% 100%)`,
                    }}
                  />
                  <span className="stat-count-number">{count}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="value-input">
        <div className="value-display">
          <span
            className="value-number"
            style={{ color: selectedStat?.color }}
          >
            {value}
          </span>
        </div>

        <div className="slider-container">
          <span className="slider-label">0</span>
          <input
            ref={sliderRef}
            type="range"
            min="0"
            max="10"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="slider"
            style={{
              '--stat-color': selectedStat?.color || '#888',
            } as React.CSSProperties}
          />
          <span className="slider-label">10</span>
        </div>
      </div>

      <button
        className={`submit-btn ${showSuccess ? 'success' : ''}`}
        onClick={handleSubmit}
        disabled={isSubmitting}
        style={{
          '--stat-color': selectedStat?.color,
        } as React.CSSProperties}
      >
        {showSuccess ? 'recorded' : 'record'}
      </button>
    </div>
  );
}
