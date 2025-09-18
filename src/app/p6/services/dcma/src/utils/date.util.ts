// src/app/p6/services/dcma/utils/date.util.ts
/** Устойчивый парсер дат: поддержка "YYYY-MM-DD", ISO, "YYYY-MM-DD HH:mm:ss" */
export function toDateStrict(v: unknown): Date | null {
    if (v == null) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    if (!s) return null;
    const iso = s.includes('T') ? s : (s.length === 10 ? `${s}T00:00:00` : s.replace(' ', 'T'));
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  
  /** Срез до начала дня в UTC (для исключения TZ/DST-дрейфа) */
  export function dayUTC(d: Date): number {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  
  /** Разница между датами в календарных днях по UTC-дням */
  export function daysDiffUTC(a: Date, b: Date): number {
    const A = dayUTC(a), B = dayUTC(b);
    const MS_IN_DAY = 24 * 3600 * 1000;
    return (A - B) / MS_IN_DAY;
  }
  