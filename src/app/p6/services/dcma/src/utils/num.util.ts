// src/app/p6/services/dcma/utils/num.util.ts
/** Парсинг чисел с допуском на пробелы/запятые */
export function parseNum(v: unknown): number | null {
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]+/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  
  /** Округление до 2 знаков (для процентов/дней) */
  export function round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
  