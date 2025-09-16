// src/app/p6/utils/compare.ts

export interface CompareOptions {
  /** пример: 3 → округлить до 3 знаков после запятой */
  round?: number | null;
  /** true → скрывать неизменившиеся поля (НО массив out.dates остаётся, если есть даты) */
  deltaOnly?: boolean;
}

type AnyRecord = Record<string, unknown>;

/* ============================
   БАЗОВЫЕ TYPE GUARDS
   ============================ */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  Object.prototype.toString.call(v) === '[object Object]';

const isNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';
const isString  = (v: unknown): v is string  => typeof v === 'string';

const isArray = Array.isArray;

/* ============================
   ДАТЫ: ДЕТЕКТ/ПАРСИНГ/РАЗНИЦА
   ============================ */

const RX_ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;

function isDateInstance(v: unknown): v is Date {
  return v instanceof Date && !Number.isNaN(v.getTime());
}

function isDateLikeString(v: unknown): v is string {
  return isString(v) && RX_ISO_DATE.test(v.trim());
}

/** Парсинг в Date. YYYY-MM-DD → полночь UTC; ISO с временем → нормализуем к дню в UTC. */
function parseDateMaybe(v: unknown): Date | null {
  if (isDateInstance(v)) return v;
  if (isDateLikeString(v)) {
    const s = v.trim();
    if (s.length === 10) {
      const [y, m, d] = s.split('-').map(Number);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      }
    }
    const t = Date.parse(s);
    if (Number.isFinite(t)) return new Date(t);
  }
  return null;
}

/** UTC-полночь в миллисекундах */
function utcMidnightMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Разница в днях (candidate - base), по UTC-полуночи */
function daysDiffUTC(a: Date, b: Date): number {
  const DAY = 86_400_000;
  return Math.round((utcMidnightMs(b) - utcMidnightMs(a)) / DAY);
}

/** Формат для вывода: YYYY-MM-DD */
function formatDateOut(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bothDates(a: unknown, b: unknown): { a: Date; b: Date } | null {
  const da = parseDateMaybe(a);
  const db = parseDateMaybe(b);
  return da && db ? { a: da, b: db } : null;
}

/* ============================
   ПРОЧИЕ ВСПОМОГАТЕЛЬНЫЕ
   ============================ */

// [{ value, count }] ?
function isValueCountArray(arr: unknown): arr is Array<{ value: string | number; count: number }> {
  if (!isArray(arr) || arr.length === 0) return false;
  return arr.every(
    (it) => isPlainObject(it) && 'value' in it && 'count' in it && isNumber((it as any).count)
  );
}

function roundMaybe(num: number, round?: number | null): number {
  if (!isNumber(num)) return num as any;
  if (round === null || round === undefined) return num;
  const p = Math.pow(10, round);
  return Math.round(num * p) / p;
}

function compareValueCountArrays(
  baseArr: Array<{ value: string | number; count: number }>,
  candArr: Array<{ value: string | number; count: number }> | undefined,
  round?: number | null,
  deltaOnly?: boolean
) {
  const map = new Map<string | number, { base: number; candidate: number }>();

  for (const b of baseArr ?? []) {
    map.set(b.value, { base: isNumber(b.count) ? b.count : 0, candidate: 0 });
  }
  for (const c of candArr ?? []) {
    const val = isNumber(c.count) ? c.count : 0;
    const slot = map.get(c.value);
    if (slot) slot.candidate = val;
    else map.set(c.value, { base: 0, candidate: val });
  }

  const out: Array<{ value: string | number; base: number; candidate: number; compare: number }> = [];
  for (const [value, pair] of map.entries()) {
    const base = roundMaybe(pair.base, round);
    const candidate = roundMaybe(pair.candidate, round);
    const compare = roundMaybe(candidate - base, round);
    if (!deltaOnly || compare !== 0) {
      out.push({ value, base, candidate, compare });
    }
  }

  out.sort((a, b) => String(a.value).localeCompare(String(b.value), 'en', { numeric: true }));
  return out;
}

function summarizeArrays(baseArr: unknown[], candArr: unknown[]) {
  return { baseLength: baseArr.length, candidateLength: candArr.length };
}

/** Равенство простых значений; для дат — равенство по дню (UTC). */
function valuesEqual(a: unknown, b: unknown): boolean {
  const both = bothDates(a, b);
  if (both) return daysDiffUTC(both.a, both.b) === 0;
  if (isNumber(a) && isNumber(b)) return a === b;
  if (isString(a) && isString(b)) return a === b;
  if (isBoolean(a) && isBoolean(b)) return a === b;
  return false;
}

/* ============================
   МАССИВ ДАТ В РЕЗУЛЬТАТЕ
   ============================ */

export interface DateCompareRow {
  key: string;
  base: string | null;        // "YYYY-MM-DD" или null
  candidate: string | null;   // "YYYY-MM-DD" или null
  compare: number | null;     // дни (candidate - base) или null
  equal: boolean | null;      // равны по дням
  baseMs: number | null;      // UTC-полночь
  candidateMs: number | null; // UTC-полночь
}

/** Итог сравнения объектов: включает массив dates и произвольные другие поля. */
export interface CompareObjectResult {
  /** Собранные даты (если в исходных объектах они есть) */
  dates?: DateCompareRow[];
  /** Остальные поля сравнения */
  [key: string]: unknown;
}

/** Собирает и сортирует строки дат из исходных base/candidate по известным ключам. */
function collectDateRows(
  baseObj: AnyRecord,
  candObj: AnyRecord,
  keys: string[] = ['planStart', 'dataDate', 'planEnd', 'mustFinish']
): DateCompareRow[] {
  const rows: DateCompareRow[] = [];

  for (const key of keys) {
    const da = parseDateMaybe(baseObj?.[key]);
    const db = parseDateMaybe(candObj?.[key]);

    if (!da && !db) continue;

    let cmp: number | null = null;
    let eq: boolean | null = null;

    if (da && db) {
      cmp = daysDiffUTC(da, db);
      eq = cmp === 0;
    }

    rows.push({
      key,
      base: da ? formatDateOut(da) : null,
      candidate: db ? formatDateOut(db) : null,
      compare: cmp,
      equal: eq,
      baseMs: da ? utcMidnightMs(da) : null,
      candidateMs: db ? utcMidnightMs(db) : null,
    });
  }

  // сортировка по baseMs (null → в конец), при равенстве — по ключу
  rows.sort((a, b) => {
    const av = a.baseMs ?? Number.POSITIVE_INFINITY;
    const bv = b.baseMs ?? Number.POSITIVE_INFINITY;
    if (av === bv) return a.key.localeCompare(b.key);
    return av - bv;
  });

  return rows;
}

/* Опциональная утилита: собрать и отсортировать даты из произвольного объекта после сравнения */
export type DateSortBy = 'base' | 'candidate' | 'earliest' | 'latest';
export function extractAndSortDateRows(
  src: Record<string, any>,
  opts: { keys?: string[]; sortBy?: DateSortBy; asc?: boolean } = {}
): DateCompareRow[] {
  const { keys, sortBy = 'base', asc = true } = opts;
  const DAY_MS = 86_400_000;

  const toMs = (x: unknown): number | null => {
    const d = parseDateMaybe(x);
    return d ? utcMidnightMs(d) : null;
  };
  const toIso = (x: unknown): string | null => {
    const d = parseDateMaybe(x);
    return d ? formatDateOut(d) : null;
  };

  const rows: DateCompareRow[] = [];
  const allKeys = keys?.length ? keys : Object.keys(src);

  for (const key of allKeys) {
    const v = src[key];
    if (!v || typeof v !== 'object' || !('base' in v) || !('candidate' in v)) continue;

    const baseMs = toMs((v as any).base);
    const candMs = toMs((v as any).candidate);
    if (baseMs == null && candMs == null) continue;

    const cmp =
      baseMs != null && candMs != null ? Math.round((candMs - baseMs) / DAY_MS) : null;

    rows.push({
      key,
      base: toIso((v as any).base),
      candidate: toIso((v as any).candidate),
      compare: isNumber((v as any).compare) ? (v as any).compare : cmp,
      equal: typeof (v as any).equal === 'boolean'
        ? (v as any).equal
        : (cmp === 0 && cmp !== null),
      baseMs,
      candidateMs: candMs
    });
  }

  const pick = (r: DateCompareRow): number => {
    switch (sortBy) {
      case 'candidate': return r.candidateMs ?? Number.POSITIVE_INFINITY;
      case 'earliest':  return Math.min(
        r.baseMs ?? Number.POSITIVE_INFINITY, r.candidateMs ?? Number.POSITIVE_INFINITY);
      case 'latest':    return Math.max(
        r.baseMs ?? Number.NEGATIVE_INFINITY, r.candidateMs ?? Number.NEGATIVE_INFINITY);
      case 'base':
      default:          return r.baseMs ?? Number.POSITIVE_INFINITY;
    }
  };

  rows.sort((a, b) => {
    const da = pick(a); const db = pick(b);
    if (da === db) return a.key.localeCompare(b.key);
    return asc ? da - db : db - da;
  });

  return rows;
}

/* ============================
   ОСНОВНАЯ ФУНКЦИЯ СРАВНЕНИЯ
   ============================ */

export function compareObjects(base: unknown, candidate: unknown, options: CompareOptions = {}): unknown {
  const { round = null, deltaOnly = false } = options;

  // ЧИСЛА
  if (isNumber(base) && isNumber(candidate)) {
    const b = roundMaybe(base, round);
    const c = roundMaybe(candidate, round);
    const compare = roundMaybe(c - b, round);
    if (deltaOnly && compare === 0) return undefined;
    return { base: b, candidate: c, compare };
  }

  // ДАТЫ (Date | ISO-строки) → сравнение в днях
  {
    const both = bothDates(base, candidate);
    if (both) {
      const days = daysDiffUTC(both.a, both.b);
      if (deltaOnly && days === 0) return undefined;
      return {
        base: formatDateOut(both.a),
        candidate: formatDateOut(both.b),
        compare: days,
        equal: days === 0
      };
    }
  }

  // БУЛЕВО/СТРОКА
  if (isBoolean(base) && isBoolean(candidate)) {
    const equal = base === candidate;
    if (deltaOnly && equal) return undefined;
    return { base, candidate, equal };
  }
  if (isString(base) && isString(candidate)) {
    const equal = base === candidate;
    if (deltaOnly && equal) return undefined;
    return { base, candidate, equal };
  }

  // МАССИВЫ
  if (isArray(base) && isArray(candidate)) {
    if (isValueCountArray(base)) {
      const res = compareValueCountArrays(base, candidate as any, round, deltaOnly);
      return deltaOnly ? (res.length ? res : undefined) : res;
    }
    const res = summarizeArrays(base, candidate);
    if (deltaOnly && res.baseLength === res.candidateLength) return undefined;
    return res;
  }

  // ОБЪЕКТЫ
  if (isPlainObject(base) && isPlainObject(candidate)) {
    const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(candidate)])).sort();
    const out: CompareObjectResult = {};
    let changed = false;

    for (const k of keys) {
      const b = (base as AnyRecord)[k];
      const c = (candidate as AnyRecord)[k];

      // если простые типы равны и deltaOnly=true → пропускаем
      if (deltaOnly && valuesEqual(b, c)) continue;

      // массив [{value,count}]
      if (isArray(b) && isValueCountArray(b)) {
        const block = compareValueCountArrays(b, isArray(c) ? c : [], round, deltaOnly);
        if (!deltaOnly || block.length) {
          out[k] = block;
          changed = true;
        }
        continue;
      }

      // оба числа/строки/булевы/датоподобные → рекурсивное сравнение
      if (
        (isNumber(b) && isNumber(c)) ||
        (isString(b) && isString(c)) ||
        (isBoolean(b) && isBoolean(c)) ||
        (parseDateMaybe(b) && parseDateMaybe(c))
      ) {
        const leaf = compareObjects(b, c, { round, deltaOnly }) as unknown;
        if (!deltaOnly || leaf !== undefined) {
          out[k] = leaf;
          changed = true;
        }
        continue;
      }

      // массивы прочих видов
      if (isArray(b) && isArray(c)) {
        const summary = summarizeArrays(b, c);
        if (!deltaOnly || summary.baseLength !== summary.candidateLength) {
          out[k] = summary;
          changed = true;
        }
        continue;
      }

      // вложенные объекты
      if (isPlainObject(b) && isPlainObject(c)) {
        const nested = compareObjects(b, c, { round, deltaOnly }) as unknown;
        if (!deltaOnly || (nested !== undefined && (isPlainObject(nested) ? Object.keys(nested as any).length > 0 : true))) {
          out[k] = nested;
          changed = true;
        }
        continue;
      }

      // разнородные/отсутствующие значения
      const leaf = { base: b, candidate: c };
      if (!deltaOnly || (b !== c)) {
        out[k] = leaf;
        changed = true;
      }
    }

    // ДОБАВЛЯЕМ МАССИВ ДАТ ИЗ ИСХОДНЫХ ОБЪЕКТОВ (всегда, если даты присутствуют)
    const dates = collectDateRows(base as AnyRecord, candidate as AnyRecord, [
      'planStart', 'dataDate', 'planEnd', 'mustFinish'
    ]);
    if (dates.length) {
      out.dates = dates;
    }

    // Если deltaOnly и нет ни изменений, ни дат — скрываем блок
    if (deltaOnly && !changed && !dates.length) return undefined;
    return out;
  }

  // разные типы / отсутствует одно из значений
  if (deltaOnly && base === candidate) return undefined;
  return { base, candidate };
}
