export interface Stat {
  id?: number;
  name: string;
  color: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Entry {
  id?: number;
  statId: number;
  value: number;
  date: string; // YYYY-MM-DD format for easy grouping
  createdAt: Date;
  updatedAt: Date;
}

export interface Settings {
  id?: number;
  lastStatId?: number;
  daysToShow: number;
  createdAt: Date;
  updatedAt: Date;
}

// For chart data
export interface ChartDataPoint {
  date: string;
  values: Record<number, number>; // statId -> averaged value
}
