// src/app/gantt/utils/date-utils.ts

import { IsoDate, TimeUnit } from '../models/gantt.types';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfISOWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay() || 7; // 1..7 (пн..вс)
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
}

export function getISOWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  return Math.ceil((((x.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1) / 7);
}

export function startOfUnit(d: Date, unit: TimeUnit): Date {
  const x = new Date(d.getTime());
  x.setHours(0,0,0,0);
  switch (unit) {
    case 'day':     return x;
    case 'week':    return startOfISOWeek(x);
    case 'month':   x.setDate(1); return x;
    case 'quarter': x.setMonth(Math.floor(x.getMonth()/3)*3, 1); return x;
    case 'year':    x.setMonth(0, 1); return x;
  }
}

export function nextUnitStart(d: Date, unit: TimeUnit): Date {
  const x = startOfUnit(d, unit);
  switch (unit) {
    case 'day':     x.setDate(x.getDate()+1);     break;
    case 'week':    x.setDate(x.getDate()+7);     break;
    case 'month':   x.setMonth(x.getMonth()+1);   break;
    case 'quarter': x.setMonth(x.getMonth()+3);   break;
    case 'year':    x.setFullYear(x.getFullYear()+1); break;
  }
  return x;
}

export function formatLabel(d: Date, unit: TimeUnit, locale = 'ru-RU'): string {
  switch (unit) {
    case 'day':     return new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(d);
    case 'week':    return 'W' + getISOWeek(d).toString();
    case 'month':   return new Intl.DateTimeFormat(locale, { month: 'short' }).format(d);
    case 'quarter': return 'Q' + (Math.floor(d.getMonth()/3)+1);
    case 'year':    return String(d.getFullYear());
  }
}

export function formatTopLabel(d: Date, unit: TimeUnit, locale = 'ru-RU'): string {
  switch (unit) {
    case 'day':     return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(d);
    case 'week':    return `Неделя ${getISOWeek(d)} ${d.getFullYear()}`;
    case 'month':   return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d);
    case 'quarter': return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`;
    case 'year':    return String(d.getFullYear());
  }
}

export function msToIso(ms: number): IsoDate {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` as IsoDate;
}

export function toMs(d: Date | string): number {
  return (d instanceof Date ? d : new Date(d)).getTime();
}

export function snapMsToDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0,0,0,0);
  return d.getTime();
}