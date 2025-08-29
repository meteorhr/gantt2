// src/app/gantt/models/gantt.model.ts

import { BarColorName, ColumnKey, IsoDate } from "./gantt.types";

export interface BarColor { name: BarColorName; color: string; }
export interface ColumnDef {
  key: ColumnKey;         // ключ поля
  title: string;          // заголовок в шапке
  width: number;          // текущая ширина
  minWidth: number;       // минимальная ширина при ресайзе
  align?: 'left' | 'center' | 'right';
}

export interface RefLine {
  name: string;
  date: Date | string;   // можно '2025-12-01' или new Date(...)
  color: string;         // 'red' | '#f00' | 'rgb(...)'
  dash?: number[];       // опционально: штрих [6,4] и т.п.
}


export  interface Node {
  id: string;
  name: string;
  start: IsoDate;
  finish: IsoDate;
  baselineStart?: IsoDate;
  baselineFinish?: IsoDate;
  complete?: number;
  dependency?: string[];
  children?: Node[];
  critical?: boolean;
}

export interface FlatRow {
  id: string;
  parentId: string | null;
  path: string[];
  wbs: string;
  name: string;
  start: string;
  finish: string;
  level: number;
  complete?: number;
  hasChildren: boolean;
  baselineStart?: string;
  baselineFinish?: string;
}

export interface GanttTooltipData {
  wbs?: string | null;
  name: string;
  start?: string | null;
  finish?: string | null;
  baselineStart?: string | null;
  baselineFinish?: string | null;
  durationDays?: number | null;
  complete?: number | null;
}