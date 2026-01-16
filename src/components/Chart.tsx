import { useMemo, useRef, useState, useEffect } from 'react';
import type { Stat, Entry } from '../types';

interface ChartProps {
  stats: Stat[];
  entries: Entry[];
  visibleDays?: number; // How many days fit in the viewport at once
}

interface ProcessedData {
  dates: string[];
  series: Map<number, (number | null)[]>; // statId -> values per date
}

function processChartData(entries: Entry[], stats: Stat[]): ProcessedData {
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

  // Get ALL dates with data, sorted chronologically
  const dates = Array.from(byDateAndStat.keys()).sort();

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

export function Chart({
  stats,
  entries,
  visibleDays = 14,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const height = 200;

  const { dates, series } = useMemo(
    () => processChartData(entries, stats),
    [entries, stats]
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

  if (entries.length === 0) {
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

  // Generate SVG path for a series
  const generatePath = (values: (number | null)[]) => {
    let path = '';
    let started = false;

    values.forEach((val, i) => {
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
    </div>
  );
}
