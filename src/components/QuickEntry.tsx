import { useState, useRef, useEffect } from 'react';
import { db, getTodayDateString } from '../db';
import type { Stat } from '../types';

interface QuickEntryProps {
  stats: Stat[];
}

export function QuickEntry({ stats }: QuickEntryProps) {
  const [selectedStatId, setSelectedStatId] = useState<number | null>(null);
  const [value, setValue] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);

  // Auto-select first stat if none selected
  useEffect(() => {
    if (selectedStatId === null && stats.length > 0) {
      setSelectedStatId(stats[0].id!);
    }
  }, [stats, selectedStatId]);

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
        {stats.map((stat) => (
          <button
            key={stat.id}
            className={`stat-chip ${selectedStatId === stat.id ? 'selected' : ''}`}
            style={{
              '--stat-color': stat.color,
            } as React.CSSProperties}
            onClick={() => setSelectedStatId(stat.id!)}
          >
            {stat.name}
          </button>
        ))}
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
