// src/app/gantt/models/gantt.types.ts

export type TimeUnit   = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type GanttScale = 'week-day' | 'month-week' | 'quarter-month' | 'year-month' | 'year-quarter';
export type IsoDate = `${number}-${number}-${number}`; // YYYY-MM-DD
export type ColumnKey = 'wbs' | 'name' | 'start' | 'finish' | string;
export type BarColorName = 'actual' | 'baseline' | 'criticalpatch' | 'group';
export type DropMode =
  | { kind: 'none' }
  | { kind: 'insert'; beforeRowIndex: number }
  | { kind: 'child'; targetRowIndex: number };