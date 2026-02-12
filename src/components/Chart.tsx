import { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../db';
import type { Stat, Entry, Event } from '../types';

interface ChartProps {
  stats: Stat[];
  entries: Entry[];
  events: Event[];
  visibleDays?: number; // How many days fit in the viewport at once
}

interface ProcessedData {
  dates: string[];
  series: Map<number, (number | null)[]>; // statId -> values per date
}

function processChartData(entries: Entry[], stats: Stat[], events: Event[]): ProcessedData {
  // Group entries by date and stat, averaging multiple entries per day
  const byDateAndStat = new Map<string, Map<number, number[]>>();

  entries.forEach((entry) => {
    if (!byDateAndStat.has(entry.date)) {
      byDateAndStat.set(entry.date, new Map());
    }
    const dateMap = byDateAndStat.get(entry.date)!;
    if (!dateMap.has(entry.statId)) {
      dateMap.set(entry.statId, []);
    }
    dateMap.get(entry.statId)!.push(entry.value);
  });

  // Include event dates so timeline shows them even without entry data
  const dateSet = new Set(byDateAndStat.keys());
  events.forEach((ev) => dateSet.add(ev.date));
  const dates = Array.from(dateSet).sort();

  // Build series data for each stat
  const series = new Map<number, (number | null)[]>();
  stats.forEach((stat) => {
    const values: (number | null)[] = dates.map((date) => {
      const dateMap = byDateAndStat.get(date);
      if (!dateMap) return null;
      const vals = dateMap.get(stat.id!);
      if (!vals || vals.length === 0) return null;
      // Average multiple entries for the same day
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    });
    series.set(stat.id!, values);
  });

  return { dates, series };
}

/** Fill nulls with linear interpolation so the path is continuous across event-only dates */
function interpolateSeries(values: (number | null)[]): (number | null)[] {
  if (values.length === 0) return values;
  const result = [...values];
  for (let i = 0; i < result.length; i++) {
    if (result[i] !== null) continue;
    let prev: number | null = null;
    let prevIdx = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (result[j] !== null) {
        prev = result[j] as number;
        prevIdx = j;
        break;
      }
    }
    let next: number | null = null;
    let nextIdx = -1;
    for (let j = i + 1; j < result.length; j++) {
      if (result[j] !== null) {
        next = result[j] as number;
        nextIdx = j;
        break;
      }
    }
    if (prev !== null && next !== null && prevIdx >= 0 && nextIdx >= 0) {
      const t = (i - prevIdx) / (nextIdx - prevIdx);
      result[i] = prev + t * (next - prev);
    }
  }
  return result;
}

export function Chart({
  stats,
  entries,
  events = [],
  visibleDays = 14,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const height = 200;

  const { dates, series } = useMemo(
    () => processChartData(entries, stats, events),
    [entries, stats, events]
  );

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Scroll to the end (most recent data) when data changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [dates.length, containerWidth]);

  // Update tooltip position when selected marker moves (scroll/resize)
  // Clamp so tooltip stays within viewport (approx half-width 160px)
  const TOOLTIP_HALF_WIDTH = 160;
  const updateTooltipPosition = useMemo(
    () => () => {
      if (!markerRef.current) return;
      const rect = markerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const left = Math.max(
        TOOLTIP_HALF_WIDTH,
        Math.min(window.innerWidth - TOOLTIP_HALF_WIDTH, centerX)
      );
      setTooltipPosition({
        left,
        top: rect.bottom + 4,
      });
    },
    []
  );

  useEffect(() => {
    if (selectedEventId === null) {
      setTooltipPosition(null);
      markerRef.current = null;
      return;
    }
    // Position after paint so ref is set
    const raf = requestAnimationFrame(() => {
      updateTooltipPosition();
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedEventId, updateTooltipPosition]);

  useEffect(() => {
    if (selectedEventId === null) return;
    const scrollEl = scrollRef.current;
    window.addEventListener('resize', updateTooltipPosition);
    scrollEl?.addEventListener('scroll', updateTooltipPosition);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      scrollEl?.removeEventListener('scroll', updateTooltipPosition);
    };
  }, [selectedEventId, updateTooltipPosition]);

  // Close event tooltip when clicking outside (marker or portaled tooltip)
  useEffect(() => {
    if (selectedEventId === null) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.chart-event-marker') || target.closest('.chart-event-tooltip-portal'))
        return;
      setSelectedEventId(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [selectedEventId]);

  if (entries.length === 0 && events.length === 0) {
    return (
      <div className="chart empty">
        <p className="chart-empty-text">your data will appear here</p>
        <div className="chart-empty-lines">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="chart-empty-line" />
          ))}
        </div>
      </div>
    );
  }

  // Chart layout
  const padding = { top: 20, right: 16, bottom: 32, left: 32 };

  // Calculate width based on visibleDays setting
  // visibleDays controls how many days fit in the viewport
  const availableWidth = containerWidth - padding.left - padding.right;
  const pixelsPerDay = availableWidth / Math.max(visibleDays - 1, 1);

  // Total width needed for all data
  const chartWidth = Math.max(
    availableWidth,
    (dates.length - 1) * pixelsPerDay
  );
  const chartTotalWidth = chartWidth + padding.left + padding.right;
  const needsScroll = dates.length > visibleDays;
  const chartHeight = height - padding.top - padding.bottom;

  // Scale helpers (return pixel values)
  const xScale = (index: number) =>
    padding.left + (index / (dates.length - 1 || 1)) * chartWidth;
  const yScale = (value: number) =>
    padding.top + chartHeight - (value / 10) * chartHeight;

  // Event date to index (for positioning markers)
  const dateToIndex = new Map(dates.map((d, i) => [d, i]));
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((ev) => {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date)!.push(ev);
    });
    return map;
  }, [events]);

  // Generate SVG path for a series (use interpolated values so line is continuous across event-only dates)
  const generatePath = (values: (number | null)[]) => {
    const interpolated = interpolateSeries(values);
    let path = '';
    let started = false;

    interpolated.forEach((val, i) => {
      if (val === null) {
        started = false;
        return;
      }
      const x = xScale(i);
      const y = yScale(val);
      if (!started) {
        path += `M ${x} ${y}`;
        started = true;
      } else {
        path += ` L ${x} ${y}`;
      }
    });

    return path;
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Calculate which x-axis labels to show (avoid overcrowding)
  const getXLabels = () => {
    if (dates.length === 0) return [];
    if (dates.length <= 3) return dates.map((d, i) => ({ date: d, index: i }));

    const labels = [{ date: dates[0], index: 0 }];
    const midIndex = Math.floor(dates.length / 2);
    labels.push({ date: dates[midIndex], index: midIndex });
    labels.push({ date: dates[dates.length - 1], index: dates.length - 1 });

    return labels;
  };

  return (
    <div className="chart">
      <div className="chart-container" ref={containerRef}>
        <div
          className="chart-scroll"
          ref={scrollRef}
          style={{ overflowX: needsScroll ? 'auto' : 'hidden' }}
        >
          <div
            className="chart-inner"
            style={{ width: chartTotalWidth }}
          >
          {/* Grid lines and labels using HTML */}
          <div className="chart-grid">
            {[0, 5, 10].map((val) => (
              <div
                key={val}
                className="chart-grid-row"
                style={{ top: `${((10 - val) / 10) * 100}%` }}
              >
                <span className="chart-y-label">{val}</span>
                <div className="chart-grid-line" />
              </div>
            ))}
          </div>

          {/* SVG for lines only */}
          {containerWidth > 0 && (
            <svg className="chart-svg" width={chartTotalWidth} height={height}>
              {stats.map((stat) => {
                const values = series.get(stat.id!) || [];
                const path = generatePath(values);
                if (!path) return null;

                return (
                  <path
                    key={stat.id}
                    d={path}
                    fill="none"
                    stroke={stat.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="chart-line"
                  />
                );
              })}
            </svg>
          )}

          {/* Data points as HTML elements (won't stretch) */}
          {containerWidth > 0 &&
            stats.map((stat) => {
              const values = series.get(stat.id!) || [];
              return values.map((val, i) =>
                val !== null ? (
                  <div
                    key={`${stat.id}-${i}`}
                    className="chart-point"
                    style={{
                      left: xScale(i),
                      top: yScale(val),
                      backgroundColor: stat.color,
                    }}
                  />
                ) : null
              );
            })}

          {/* Today indicator line */}
          {containerWidth > 0 && (() => {
            const today = new Date().toISOString().split('T')[0];
            const todayIndex = dates.indexOf(today);
            if (todayIndex === -1) return null;
            return (
              <div
                className="chart-today-line"
                style={{ left: xScale(todayIndex) }}
              >
                <span className="chart-today-label">today</span>
              </div>
            );
          })()}

          {/* X-axis labels */}
          {containerWidth > 0 && dates.length > 0 && (
            <div className="chart-x-labels">
              {getXLabels().map(({ date, index }) => (
                <span key={date} style={{ left: xScale(index) }}>
                  {formatDate(date)}
                </span>
              ))}
            </div>
          )}

          {/* Event markers overlay - floats on top so lines render continuously underneath */}
          {containerWidth > 0 &&
            dates.length > 0 && (
              <div className="chart-events-overlay">
                {events.map((ev) => {
                  const index = dateToIndex.get(ev.date);
                  if (index === undefined) return null;
                  const onSameDate = eventsByDate.get(ev.date) ?? [];
                  const offset = onSameDate.findIndex((e) => e.id === ev.id);
                  const x = xScale(index) + (onSameDate.length > 1 ? (offset - (onSameDate.length - 1) / 2) * 12 : 0);
                  const isSelected = selectedEventId === ev.id;
                  return (
                    <div
                      key={ev.id}
                      ref={isSelected ? markerRef : undefined}
                      className={`chart-event-marker ${isSelected ? 'selected' : ''}`}
                      style={{ left: x, top: padding.top + 2 }}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest('.chart-event-tooltip-portal')) return;
                        setSelectedEventId(isSelected ? null : ev.id ?? null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedEventId(isSelected ? null : ev.id ?? null);
                        }
                        if (e.key === 'Escape') setSelectedEventId(null);
                      }}
                      aria-label={`${ev.name}${ev.note ? `: ${ev.note}` : ''}`}
                      title={ev.note ? `${ev.name}: ${ev.note}` : ev.name}
                    >
                      <span className="chart-event-icon">{ev.icon}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="chart-legend">
        {stats.map((stat) => (
          <div key={stat.id} className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: stat.color }} />
            <span className="legend-name">{stat.name}</span>
          </div>
        ))}
      </div>

      {/* Event tooltip portal (renders outside scroll container so it isn't clipped) */}
      {selectedEventId != null &&
        tooltipPosition != null &&
        (() => {
          const ev = events.find((e) => e.id === selectedEventId);
          if (!ev) return null;
          return createPortal(
            <div
              className="chart-event-tooltip chart-event-tooltip-portal"
              role="tooltip"
              style={{
                position: 'fixed',
                left: tooltipPosition.left,
                top: tooltipPosition.top,
                transform: 'translateX(-50%)',
                zIndex: 9999,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {ev.name && <span className="chart-event-tooltip-name">{ev.name}</span>}
              {ev.note && <span className="chart-event-tooltip-note">{ev.note}</span>}
              <div className="chart-event-tooltip-actions">
                <label className="chart-event-tooltip-date-wrap">
                  <span className="chart-event-tooltip-date-label">
                    <span className="chart-event-pencil" aria-hidden>✏</span>
                    Date
                  </span>
                  <input
                    type="date"
                    className="chart-event-date-input"
                    value={ev.date}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (ev.id != null && next) db.events.update(ev.id, { date: next });
                    }}
                    aria-label="Change event date"
                  />
                </label>
                <button
                  type="button"
                  className="chart-event-delete-btn"
                  onClick={() => {
                    if (ev.id != null) {
                      db.events.delete(ev.id);
                      setSelectedEventId(null);
                    }
                  }}
                  aria-label="Delete event"
                  title="Delete event"
                >
                  ×
                </button>
              </div>
            </div>,
            document.body
          );
        })()}
    </div>
  );
}
