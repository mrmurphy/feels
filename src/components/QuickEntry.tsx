import { useState, useRef, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getTodayDateString, DEFAULT_SETTINGS } from '../db';
import type { Stat, Settings, Event } from '../types';

interface QuickEntryProps {
  stats: Stat[];
  settings: Settings;
  events: Event[];
}

export function QuickEntry({ stats, settings, events }: QuickEntryProps) {
  const [selectedStatId, setSelectedStatId] = useState<number | null>(null);
  const [value, setValue] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [newEventIcon, setNewEventIcon] = useState('📌');
  const [newEventName, setNewEventName] = useState('');
  const [newEventNote, setNewEventNote] = useState('');
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

  const today = getTodayDateString();

  // Count events today per (icon, name) for badges
  const todayEventCountByKey = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((ev) => {
      if (ev.date !== today) return;
      const key = `${ev.icon}\0${ev.name}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [events, today]);

  // Recently used event templates: unique (icon, name) by most recent use
  const recentEventTemplates = useMemo(() => {
    const byKey = new Map<string, { icon: string; name: string; lastAt: Date }>();
    events.forEach((ev) => {
      const key = `${ev.icon}\0${ev.name}`;
      const existing = byKey.get(key);
      if (!existing || ev.createdAt > existing.lastAt) {
        byKey.set(key, { icon: ev.icon, name: ev.name, lastAt: ev.createdAt });
      }
    });
    return Array.from(byKey.values())
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .slice(0, 8);
  }, [events]);

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

  const addEvent = async (icon: string, name: string, note?: string) => {
    await db.events.add({
      icon,
      name: name.trim() || 'Event',
      note: note?.trim() || undefined,
      date: getTodayDateString(),
    } as never);
    setShowEventForm(false);
    setNewEventName('');
    setNewEventNote('');
    setNewEventIcon('📌');
  };

  const handleAddRecentEvent = (icon: string, name: string) => {
    addEvent(icon, name);
  };

  const handleSubmitNewEvent = () => {
    addEvent(newEventIcon, newEventName, newEventNote);
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

      <section className="quick-events" aria-label="Events">
        <div className="quick-events-row">
          {recentEventTemplates.map((t) => {
            const key = `${t.icon}\0${t.name}`;
            const todayCount = todayEventCountByKey.get(key) ?? 0;
            return (
              <button
                key={key}
                type="button"
                className="event-chip"
                onClick={() => handleAddRecentEvent(t.icon, t.name)}
                title={`Add ${t.name} for today`}
              >
                <span className="event-chip-icon" aria-hidden>{t.icon}</span>
                <span className="event-chip-name">{t.name}</span>
                {todayCount > 0 && (
                  <span className="event-chip-count">{todayCount}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            className="event-chip event-chip-new"
            onClick={() => setShowEventForm(!showEventForm)}
            aria-expanded={showEventForm}
            aria-label={showEventForm ? 'Close new event form' : 'Add new event'}
          >
            <span className="event-chip-icon" aria-hidden>+</span>
            <span className="event-chip-name">New event</span>
          </button>
        </div>
        {showEventForm && (
          <div className="event-form">
            <div className="event-form-row">
              <label className="event-form-label">Icon</label>
              <input
                type="text"
                className="event-form-emoji"
                value={newEventIcon}
                onChange={(e) => setNewEventIcon(e.target.value.slice(0, 2) || '📌')}
                placeholder="📌"
                maxLength={2}
                aria-label="Event icon (emoji)"
              />
            </div>
            <div className="event-form-row">
              <label className="event-form-label">Name</label>
              <input
                type="text"
                className="event-form-input"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="e.g. Doctor, Workout"
                maxLength={24}
                aria-label="Event name"
              />
            </div>
            <div className="event-form-row">
              <label className="event-form-label">Note (optional)</label>
              <input
                type="text"
                className="event-form-input"
                value={newEventNote}
                onChange={(e) => setNewEventNote(e.target.value)}
                placeholder="Short note"
                aria-label="Event note"
              />
            </div>
            <button
              type="button"
              className="event-form-submit"
              onClick={handleSubmitNewEvent}
            >
              Add for today
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
