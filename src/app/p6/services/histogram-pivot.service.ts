import { Injectable } from '@angular/core';

/** ==== Типы из вашего HistogramService (новая форма) ==== */
export interface NewHistogramPoint {
  period: string;           // 'YYYY-MM' или 'YYYY-MM-DD'
  planned_qty: number;
  actual_qty: number;
  remaining_qty: number;
  planned_cost: number;
  actual_cost: number;
  remaining_cost: number;
}

export interface HistogramSeriesNew {
  rsrc_id: number | null;   // null = overall
  points: NewHistogramPoint[];
}

export interface HistogramResource {
  rsrc_id: number;
  code: string;
  name: string;
  clndr_id: number | null;
}

export interface HistogramResultNew {
  periods: string[];
  data: HistogramSeriesNew[];   // [0] — overall; [1..] — по ресурсам, если perResource=true
  // Дополнительно, если вы вернули из buildHistogram():
  resources?: HistogramResource[];
}

/** ==== Опции и выходные структуры для сводной матрицы ==== */
export type PivotBucket   = 'day' | 'month' | 'year';
export type PivotMode     = 'qty' | 'cost';
export type PivotMeasure  = 'planned' | 'actual' | 'remaining' | 'total';

export interface PivotOptions {
  /** Желаемая корзина вывода. Можно всегда укрупнять: day→month→year. Умельчать (month→day) нельзя. */
  bucket?: PivotBucket;           // по умолчанию 'month'
  /** Единицы или стоимость */
  mode?: PivotMode;               // по умолчанию 'qty'
  /** Какую метрику брать из трёх, либо сумму трёх */
  measure?: PivotMeasure;         // по умолчанию 'planned'
  /** Добавить последний столбец «Total» (сумма по ресурсам) */
  includeTotal?: boolean;         // по умолчанию true
  /** Явный порядок ресурсов (коды). Если не задан — сортировка по коду по возрастанию. */
  codeOrder?: string[];
}

/** Строка сводной таблицы. period + динамические столбцы ресурсов (+Total). */
export type PivotRow = Record<string, string | number>;

/** Результат построения матрицы. */
export interface PivotMatrix {
  /** Заголовки столбцов: ['period', ...codes, 'Total?'] */
  header: string[];
  /** Помесячные/подневные/погодовые значения */
  rows: PivotRow[];
  /** Те же периоды, но значения — накопления по периодам (cumulative) */
  rowsCumulative: PivotRow[];
  /** Порядок кодов ресурсов (без 'period' и 'Total') */
  codes: string[];
  /** Исходные ресурсы (если были) — в порядке columns */
  resources: HistogramResource[];
  /** Итого по каждому ресурсу (сумма всех period) — удобно для сортировки или подписи */
  totalsByCode: Record<string, number>;
  /** Итого по каждому периоду */
  totalsByPeriod: Record<string, number>;
}

/** ==== Вспомогательные утилиты для периодов ==== */
function toYear(period: string): string {
  // 'YYYY-MM' | 'YYYY-MM-DD' -> 'YYYY'
  return period.slice(0, 4);
}
function toMonth(period: string): string {
  // 'YYYY-MM' | 'YYYY-MM-DD' -> 'YYYY-MM'
  return period.slice(0, 7);
}
function normPeriod(source: string, want: PivotBucket, have: PivotBucket): string {
  // Можно только укрупнять: day->month->year, month->year. Наоборот — возвращаем как есть.
  if (want === have) return have === 'day' ? source : (have === 'month' ? toMonth(source) : toYear(source));
  if (have === 'day' && want === 'month') return toMonth(source);
  if (have === 'day' && want === 'year')  return toYear(source);
  if (have === 'month' && want === 'year') return toYear(source);
  // попытка сделать day при входных month/year — не поддерживается: вернём исходный агрегированный ключ
  return have === 'month' ? toMonth(source) : toYear(source);
}

function detectBucketFromPeriods(periods: string[]): PivotBucket {
  // 'YYYY-MM-DD' -> day, 'YYYY-MM' -> month, 'YYYY' -> year
  if (!periods?.length) return 'month';
  const s = periods[0];
  if (s.length >= 10) return 'day';
  if (s.length >= 7)  return 'month';
  return 'year';
}

/** Выбор нужного значения из точки */
function pickValue(p: NewHistogramPoint, mode: PivotMode, measure: PivotMeasure): number {
  const get = (k: 'planned' | 'actual' | 'remaining') => {
    if (mode === 'qty')  return k === 'planned' ? p.planned_qty  : k === 'actual' ? p.actual_qty  : p.remaining_qty;
    /* mode === 'cost' */ return k === 'planned' ? p.planned_cost : k === 'actual' ? p.actual_cost : p.remaining_cost;
  };
  if (measure === 'total') return get('planned') + get('actual') + get('remaining');
  return get(measure);
}

@Injectable({ providedIn: 'root' })
export class HistogramPivotService {

  /**
   * Строит сводную матрицу «период × ресурс-код» для Units/Cost с опцией накоплений.
   * ВАЖНО: для корректной матрицы по ресурсам исходный HistogramResult должен быть собран с `perResource: true`.
   */
  buildPivotFromHistogram(result: HistogramResultNew, opts?: PivotOptions): PivotMatrix {
    const bucket: PivotBucket  = opts?.bucket   ?? 'month';
    const mode: PivotMode      = opts?.mode     ?? 'qty';
    const measure: PivotMeasure= opts?.measure  ?? 'planned';
    const includeTotal         = opts?.includeTotal !== false;

    // 0) Проверки входа
    if (!result || !Array.isArray(result.data) || result.data.length === 0) {
      return { header: ['period'], rows: [], rowsCumulative: [], codes: [], resources: [], totalsByCode: {}, totalsByPeriod: {} };
    }

    // 1) Периоды исходного результата и их «гранулярность»
    const haveBucket: PivotBucket = detectBucketFromPeriods(result.periods ?? []);

    // 2) Список ресурсных серий: в новой форме [0] — overall, [1..] — по ресурсам (при perResource=true)
    const series = result.data.slice(1); // ресурсы
    const hasResources = series.length > 0;

    // Если нет по-ресурсных серий — деградируем в один столбец 'ALL' из overall
    // (но вы просили «ресурс 1, 2, 3 ...», поэтому лучше обеспечить perResource:true при построении histogram)
    const fallbackOverall = !hasResources ? [ result.data[0] ] : [];

    // 3) Справочник ресурсов: rsrc_id -> code/name
    const resourceMeta = (result as any).resources as HistogramResource[] | undefined;
    const codeByRid = new Map<number, string>();
    const metaByCode = new Map<string, HistogramResource>();
    if (Array.isArray(resourceMeta) && resourceMeta.length) {
      for (const r of resourceMeta) {
        codeByRid.set(r.rsrc_id, r.code);
        metaByCode.set(r.code, r);
      }
    }

    // 4) Собираем «код столбца» для каждой ресурсной серии
    type SeriesDef = { code: string; rid: number | null; points: NewHistogramPoint[] };
    const seriesList: SeriesDef[] = [];

    if (hasResources) {
      for (const s of series) {
        // rid != null гарантирует ресурсную серию
        const rid = s.rsrc_id;
        const code =
          (rid != null && codeByRid.has(rid)) ? codeByRid.get(rid)! :
          (rid != null ? String(rid) : 'ALL');
        seriesList.push({ code, rid, points: Array.isArray(s.points) ? s.points : [] });
        if (rid != null && !metaByCode.has(code)) {
          // если нет меты — создадим простую
          metaByCode.set(code, { rsrc_id: rid, code, name: code, clndr_id: null });
        }
      }
    } else {
      // Деградация: один столбец 'ALL'
      const s = fallbackOverall[0];
      seriesList.push({ code: 'ALL', rid: null, points: Array.isArray(s.points) ? s.points : [] });
      if (!metaByCode.has('ALL')) {
        metaByCode.set('ALL', { rsrc_id: -1, code: 'ALL', name: 'All', clndr_id: null });
      }
    }

    // 5) Нормализуем периоды под требуемую корзину (можем только укрупнять)
    const periodSet = new Set<string>();
    for (const s of seriesList) {
      for (const p of s.points) {
        periodSet.add(normPeriod(p.period, bucket, haveBucket));
      }
    }
    const periods = Array.from(periodSet).sort(); // возрастание: 'YYYY' < 'YYYY-01' < 'YYYY-01-01'

    // 6) Заполним матрицу: value[period][code] = число; также подсчитаем totals
    const valueByPeriod = new Map<string, Map<string, number>>();
    const totalsByCode: Record<string, number> = {};
    const totalsByPeriod: Record<string, number> = {};

    // функция аккумулирования
    const add = (per: string, code: string, v: number) => {
      if (!valueByPeriod.has(per)) valueByPeriod.set(per, new Map());
      const row = valueByPeriod.get(per)!;
      row.set(code, (row.get(code) ?? 0) + v);
      totalsByCode[code]   = (totalsByCode[code]   ?? 0) + v;
      totalsByPeriod[per]  = (totalsByPeriod[per]  ?? 0) + v;
    };

    for (const s of seriesList) {
      for (const p of s.points) {
        const per = normPeriod(p.period, bucket, haveBucket);
        const v = pickValue(p, mode, measure);
        if (!Number.isFinite(v)) continue;
        add(per, s.code, v);
      }
    }

    // 7) Порядок столбцов-кодов
    let codes = Array.from(
      new Set(seriesList.map(s => s.code))
    );
    if (opts?.codeOrder?.length) {
      // Зафиксированный порядок, плюс добавим вдруг новые коды (в конце)
      const wanted = opts.codeOrder.filter(c => codes.includes(c));
      const rest = codes.filter(c => !wanted.includes(c));
      codes = [...wanted, ...rest];
    } else {
      // По коду (человекочитаемо). Можно заменить на сортировку по Totals, если нужно.
      codes.sort((a, b) => a.localeCompare(b));
    }

    // 8) Формируем строки для MatTable
    const header = ['period', ...codes, ...(includeTotal ? ['Total'] : [])];

    const rows: PivotRow[] = [];
    const rowsCumulative: PivotRow[] = [];

    // аккумулятор для накоплений по каждому коду
    const cumByCode: Record<string, number> = Object.fromEntries(codes.map(c => [c, 0]));
    let cumTotal = 0;

    for (const per of periods) {
      // периодические значения
      const srcRow = valueByPeriod.get(per) ?? new Map<string, number>();
      const row: PivotRow = { period: per };
      let total = 0;
      for (const code of codes) {
        const v = srcRow.get(code) ?? 0;
        row[code] = v;
        total += v;
      }
      if (includeTotal) row['Total'] = total;
      rows.push(row);

      // накопительные
      const rowCum: PivotRow = { period: per };
      for (const code of codes) {
        const v = (row[code] as number) ?? 0;
        cumByCode[code] += v;
        rowCum[code] = cumByCode[code];
      }
      cumTotal += total;
      if (includeTotal) rowCum['Total'] = cumTotal;
      rowsCumulative.push(rowCum);
    }

    // 9) Соберём массив ресурсов в порядке колонок (чтобы удобно печатать легенду/подписи)
    const resources: HistogramResource[] = codes.map(code => {
      const meta = metaByCode.get(code);
      return meta ? meta : { rsrc_id: -1, code, name: code, clndr_id: null };
    });

    return {
      header,
      rows,
      rowsCumulative,
      codes,
      resources,
      totalsByCode,
      totalsByPeriod,
    };
  }
}
