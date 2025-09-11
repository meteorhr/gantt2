import { inject, Injectable } from '@angular/core';
import { P6DexieService } from '../dexie.service';

/** Вспомогательные типы входа/выхода */
export interface HistogramOptions {
  /** 'month' или 'day' — размер корзины гистограммы */
  bucket: 'month' | 'day';
  /** агрегировать по ресурсу (true) или вернуть общий (false) и/или срезы */
  perResource?: boolean;
  /** Диапазон дат (включительно) ограничения выборки */
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  /** Учитывать стоимость в расчётах (по умолчанию true) */
  includeCost?: boolean;
}

export interface HistogramPoint {
  /** Ключ корзины: YYYY-MM или YYYY-MM-DD */
  period: string;
  /** Идентификатор ресурса (если perResource=true); иначе null */
  rsrc_id: number | null;
  /** Суммы единиц */
  planned_qty: number;
  actual_qty: number;
  remaining_qty: number;
  /** Суммы стоимости (если includeCost = true) */
  planned_cost: number;
  actual_cost: number;
  remaining_cost: number;
}

/** Метаданные ресурса для легенды/подписей */
export interface HistogramResource {
  rsrc_id: number;
  code: string;
  name: string;
  clndr_id: number | null;
}

/** Серия данных для построения графика */
export interface HistogramSeries {
  /** null для «Overall», либо rsrc_id ресурса */
  rsrc_id: number | null;
  /** Человекочитаемое имя серии (например, код + имя ресурса, либо 'All') */
  name: string;
  /** Короткий код серии (например, код ресурса; для overall — 'ALL') */
  code: string;
  /** Точки гистограммы по периодам */
  points: HistogramPoint[];
  /** Быстрые тоталы серии */
  totals: {
    planned_qty: number;
    actual_qty: number;
    remaining_qty: number;
    planned_cost: number;
    actual_cost: number;
    remaining_cost: number;
  };
}

export interface HistogramResult {
  /** Общая гистограмма (всех ресурсов) */
  overall: HistogramPoint[];
  /** Гистограммы по каждому ресурсу (если perResource=true) */
  byResource: Record<number, HistogramPoint[]>; // rsrc_id -> points

  /** ДОБАВЛЕНО: готовые серии для графика (overall + по ресурсам при perResource=true) */
  data: HistogramSeries[];

  /** ДОБАВЛЕНО: метаданные ресурсов, встречающихся в byResource */
  resources: HistogramResource[];

  /** ДОБАВЛЕНО: список всех периодов в сортированном порядке (для оси X) */
  periods: string[];
}

/** Удобный guard для чисел */
function isFiniteNum(x: any): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Обрубить время: локальная полночь для стабильного «дня» */
function floorToLocalDate(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

/** Ключ корзины */
function bucketKey(d: Date, bucket: 'day' | 'month'): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  if (bucket === 'month') return `${y}-${m}`;
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Итерация по дням включительно */
function eachDayInclusive(start: Date, end: Date, fn: (d: Date) => void): void {
  const s = floorToLocalDate(start);
  const e = floorToLocalDate(end);
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    fn(new Date(cur));
  }
}

/** Безопасная дата из unknown */
function asDate(v: any): Date | null {
  if (v == null) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Мягкое умножение (если null — 0) */
function mul(a: number | null | undefined, b: number | null | undefined): number {
  const x = isFiniteNum(a) ? a : 0;
  const y = isFiniteNum(b) ? b : 0;
  return x * y;
}

/** Деление с защитой (0 при делении на 0/NaN) */
function safeDiv(a: number, b: number): number {
  if (!isFiniteNum(a) || !isFiniteNum(b) || b === 0) return 0;
  return a / b;
}

/** Обрезка по диапазону */
function clampDateRange(d: Date, min?: Date | null, max?: Date | null): Date {
  let x = d;
  if (min && x < min) x = min;
  if (max && x > max) x = max;
  return x;
}

/** Кривые распределения (веса по дням) */
type CurveType = 'Linear' | 'Front' | 'Back' | 'Bell' | 'Custom';
function curveWeights(n: number, kind: CurveType, custom?: number[]): number[] {
  if (n <= 0) return [];
  if (kind === 'Custom' && Array.isArray(custom) && custom.length >= n) {
    const slice = custom.slice(0, n);
    const sum = slice.reduce((a, b) => a + (isFiniteNum(b) ? b : 0), 0);
    return sum > 0 ? slice.map(v => v / sum) : Array(n).fill(1 / n);
  }
  if (kind === 'Front') {
    const arr = Array.from({ length: n }, (_, i) => Math.pow(0.5, i / Math.max(1, n - 1)));
    const sum = arr.reduce((a, b) => a + b, 0);
    return arr.map(v => v / sum);
  }
  if (kind === 'Back') {
    const arr = Array.from({ length: n }, (_, i) => Math.pow(0.5, (n - 1 - i) / Math.max(1, n - 1)));
    const sum = arr.reduce((a, b) => a + b, 0);
    return arr.map(v => v / sum);
  }
  if (kind === 'Bell') {
    const mu = (n - 1) / 2;
    const sigma = Math.max(1, n / 6);
    const arr = Array.from({ length: n }, (_, i) => Math.exp(-0.5 * Math.pow((i - mu) / sigma, 2)));
    const sum = arr.reduce((a, b) => a + b, 0);
    return arr.map(v => v / sum);
  }
  return Array(n).fill(1 / n);
}

/** Мини-движок календаря: Mon–Fri рабочие, если в таблице нет чёткой инфы */
class CalendarEngine {
  private calMap = new Map<number, any>();
  constructor(calRows: any[]) {
    for (const r of calRows) {
      const id = Number(r['clndr_id']);
      if (Number.isFinite(id)) this.calMap.set(id, r);
    }
  }
  isWorkDay(d: Date, clndr_id?: number | null): boolean {
    const wd = d.getDay(); // 0..6 (Sun..Sat)
    return wd >= 1 && wd <= 5;
  }
  dayHours(d: Date, clndr_id?: number | null): number {
    return 8;
  }
}

/** Попытка прочитать возможные «дневные спреды». */
async function tryLoadDailySpreads(dexie: any): Promise<{
  byTaskRsrcPlanned: Map<number, Map<string, number>>;
  byTaskRsrcActual: Map<number, Map<string, number>>;
  byTaskRsrcRemaining: Map<number, Map<string, number>>;
}> {
  const empty = {
    byTaskRsrcPlanned: new Map<number, Map<string, number>>(),
    byTaskRsrcActual: new Map<number, Map<string, number>>(),
    byTaskRsrcRemaining: new Map<number, Map<string, number>>(),
  };

  try {
    const spread = await dexie.getRows('TASKRSRC_SPREAD');
    if (!Array.isArray(spread) || spread.length === 0) return empty;

    const p = new Map<number, Map<string, number>>();
    const a = new Map<number, Map<string, number>>();
    const r = new Map<number, Map<string, number>>();

    for (const row of spread) {
      const trId = Number(row['taskrsrc_id']);
      if (!Number.isFinite(trId)) continue;
      const dateStr = String(row['date']); // ожидаем 'YYYY-MM-DD'
      if (!dateStr || dateStr.length < 10) continue;

      const pu = Number(row['planned_qty'] ?? row['planned_units'] ?? row['DailySpreadPlannedUnits']);
      const au = Number(row['actual_qty'] ?? row['actual_units'] ?? row['DailySpreadActualUnits']);
      const ru = Number(row['remaining_qty'] ?? row['remaining_units'] ?? row['DailySpreadRemainingUnits']);

      if (Number.isFinite(pu)) {
        if (!p.has(trId)) p.set(trId, new Map());
        p.get(trId)!.set(dateStr, (p.get(trId)!.get(dateStr) ?? 0) + pu);
      }
      if (Number.isFinite(au)) {
        if (!a.has(trId)) a.set(trId, new Map());
        a.get(trId)!.set(dateStr, (a.get(trId)!.get(dateStr) ?? 0) + au);
      }
      if (Number.isFinite(ru)) {
        if (!r.has(trId)) r.set(trId, new Map());
        r.get(trId)!.set(dateStr, (r.get(trId)!.get(dateStr) ?? 0) + ru);
      }
    }

    return {
      byTaskRsrcPlanned: p,
      byTaskRsrcActual: a,
      byTaskRsrcRemaining: r,
    };
  } catch {
    return empty;
  }
}

/** Стоимость дня из units и RA, если линк включён; иначе — доля от total_cost */
function computeDailyCost(unitsToday: number, totalUnits: number, totalCost: number, costPerQty: number | null, linked: boolean): number {
  if (linked && isFiniteNum(costPerQty)) {
    return unitsToday * costPerQty!;
  }
  if (totalUnits > 0 && isFiniteNum(totalCost)) {
    return totalCost * (unitsToday / totalUnits);
  }
  return 0;
}

/** жёстко нормализуем «да/нет» флаги */
function toBoolYN(v: any): boolean {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1';
  }
  return Boolean(v);
}

@Injectable({ providedIn: 'root' })
export class HistogramService {

  private readonly dexie = inject(P6DexieService);

  constructor() {}

  /**
   * Основной метод: строит гистограмму по RSRC/TASKRSRC/TASK/PROJECT/CALENDAR.
   * @param opts Параметры построения
   */
  async buildHistogram(opts: HistogramOptions): Promise<HistogramResult> {
    const includeCost = opts.includeCost !== false;

    // 1) Подтянем все таблицы
    const [rsrcRows, rsrcRoleRows, trRows, taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('RSRC'),
      this.dexie.getRows('RSRCROLE'),
      this.dexie.getRows('TASKRSRC'),
      this.dexie.getRows('TASK'),
      this.dexie.getRows('PROJECT'),
      this.dexie.getRows('CALENDAR'),
    ]);

    // Календарный движок
    const cal = new CalendarEngine(Array.isArray(calRows) ? calRows : []);

    // Быстрые мапы
    const taskById = new Map<number, any>();
    for (const t of (Array.isArray(taskRows) ? taskRows : [])) {
      const id = Number(t['task_id']);
      if (Number.isFinite(id)) taskById.set(id, t);
    }

    const projById = new Map<number, any>();
    for (const p of (Array.isArray(projRows) ? projRows : [])) {
      const id = Number(p['proj_id']);
      if (Number.isFinite(id)) projById.set(id, p);
    }

    const rsrcById = new Map<number, any>();
    for (const r of (Array.isArray(rsrcRows) ? rsrcRows : [])) {
      const id = Number(r['rsrc_id'] ?? r['id']);
      if (Number.isFinite(id)) rsrcById.set(id, r);
    }

    // Возможные дневные спреды (если есть отдельная таблица)
    const dailySpreads = await tryLoadDailySpreads(this.dexie);

    // Общий аккумулятор
    const overall = new Map<string, HistogramPoint>();
    const byRes: Record<number, Map<string, HistogramPoint>> = {};

    // Вспомогательная вставка в корзину
    const addToBucket = (period: string, rsrc_id: number | null, du: { p: number; a: number; r: number }, dc: { p: number; a: number; r: number }) => {
      const put = (map: Map<string, HistogramPoint>, key: string) => {
        let row = map.get(key);
        if (!row) {
          row = {
            period,
            rsrc_id,
            planned_qty: 0, actual_qty: 0, remaining_qty: 0,
            planned_cost: 0, actual_cost: 0, remaining_cost: 0,
          };
          map.set(key, row);
        }
        row.planned_qty += du.p;
        row.actual_qty += du.a;
        row.remaining_qty += du.r;
        if (includeCost) {
          row.planned_cost += dc.p;
          row.actual_cost += dc.a;
          row.remaining_cost += dc.r;
        }
      };

      // perResource (индивидуальные корзины по ресурсам)
      if (rsrc_id != null) {
        if (!byRes[rsrc_id]) byRes[rsrc_id] = new Map<string, HistogramPoint>();
        put(byRes[rsrc_id], period);
      }

      // overall
      put(overall, period);
    };

    // 2) Проходим по всем назначениям
    const TR = Array.isArray(trRows) ? trRows : [];
    for (const ra of TR) {
      const task_id = Number(ra['task_id']);
      const proj_id = Number(ra['proj_id']);
      const rsrc_id = isFiniteNum(ra['rsrc_id']) ? Number(ra['rsrc_id']) : null;

      if (!Number.isFinite(task_id) || !Number.isFinite(proj_id)) continue;

      const task = taskById.get(task_id) ?? {};
      const proj = projById.get(proj_id) ?? {};

      // Data Date
      const dataDate: Date | null = asDate(proj['data_date']) ?? null;

      // Календарь: приоритет — календарь активности, затем ресурса, затем проекта
      const taskClndrId: number | null = isFiniteNum(task['clndr_id']) ? Number(task['clndr_id']) : null;
      const rsrcClndrId: number | null = isFiniteNum((rsrcById.get(rsrc_id ?? -1) ?? {})['clndr_id']) ? Number((rsrcById.get(rsrc_id ?? -1) ?? {})['clndr_id']) : null;
      const projClndrId: number | null = isFiniteNum(proj['clndr_id']) ? Number(proj['clndr_id']) : null;
      const clndrId = taskClndrId ?? rsrcClndrId ?? projClndrId ?? null;

      // Поля RA
      const costPerQty = isFiniteNum(ra['cost_per_qty']) ? Number(ra['cost_per_qty']) : null;
      const linked = toBoolYN(ra['cost_qty_link_flag']);

      const plannedCurveTxt = (ra['planned_curve'] ?? '').toString();
      const remainCurveTxt = (ra['remaining_curve'] ?? '').toString();
      const plannedCurve: CurveType = plannedCurveTxt ? (plannedCurveTxt as CurveType) : 'Linear';
      const remainCurve: CurveType = remainCurveTxt ? (remainCurveTxt as CurveType) : 'Linear';

      const target_qty = isFiniteNum(ra['target_qty']) ? Number(ra['target_qty']) : 0;
      const act_qty    = isFiniteNum(ra['act_qty'])    ? Number(ra['act_qty'])    : 0;
      const remain_qty = isFiniteNum(ra['remain_qty']) ? Number(ra['remain_qty']) : 0;

      const target_cost = isFiniteNum(ra['target_cost']) ? Number(ra['target_cost']) : 0;
      const act_cost    = isFiniteNum(ra['act_cost'])    ? Number(ra['act_cost'])    : 0;
      const remain_cost = isFiniteNum(ra['remain_cost']) ? Number(ra['remain_cost']) : 0;

      const targetStart = asDate(ra['target_start_date']) ?? asDate(ra['start_date']) ?? null;
      const targetFinish = asDate(ra['target_end_date']) ?? asDate(ra['finish_date']) ?? null;

      const actStart = asDate(ra['act_start_date']);
      const actFinish = asDate(ra['act_end_date']);

      const remStart = asDate(ra['rem_start_date']) ?? targetStart;
      const remFinish = asDate(ra['rem_end_date']) ?? targetFinish;

      // Диапазон ограничения
      const rangeStart = opts.rangeStart ? floorToLocalDate(opts.rangeStart) : null;
      const rangeEnd = opts.rangeEnd ? floorToLocalDate(opts.rangeEnd) : null;

      // ======== Вариант A: если есть дневные спреды для этого назначения ========
      const trId = Number(ra['taskrsrc_id']);
      const pMap = dailySpreads.byTaskRsrcPlanned.get(trId) ?? null;
      const aMap = dailySpreads.byTaskRsrcActual.get(trId) ?? null;
      const rMap = dailySpreads.byTaskRsrcRemaining.get(trId) ?? null;

      if (pMap || aMap || rMap) {
        const daySet = new Set<string>();
        for (const m of [pMap, aMap, rMap]) {
          if (!m) continue;
          for (const k of m.keys()) daySet.add(k);
        }

        const totalP = target_qty;
        const totalA = act_qty;
        const totalR = remain_qty;

        for (const dayStr of Array.from(daySet)) {
          const d = new Date(dayStr + 'T00:00:00');
          const dClamped = clampDateRange(d, rangeStart, rangeEnd);
          if (floorToLocalDate(dClamped).getTime() !== floorToLocalDate(d).getTime()) continue;

          const pq = pMap ? (pMap.get(dayStr) ?? 0) : 0;
          const aq = aMap ? (aMap.get(dayStr) ?? 0) : 0;
          const rq = rMap ? (rMap.get(dayStr) ?? 0) : 0;

          const pc = includeCost ? computeDailyCost(pq, totalP, target_cost, costPerQty, linked) : 0;
          const ac = includeCost ? computeDailyCost(aq, totalA, act_cost,    costPerQty, linked) : 0;
          const rc = includeCost ? computeDailyCost(rq, totalR, remain_cost, costPerQty, linked) : 0;

          const period = bucketKey(d, opts.bucket);
          addToBucket(period, opts.perResource ? (rsrc_id ?? null) : null, { p: pq, a: aq, r: rq }, { p: pc, a: ac, r: rc });
        }

        continue;
      }

      // ======== Вариант B: нет дневных спредов — раскладка по календарю ========

      // --- План ---
      if (target_qty > 0 && targetStart && targetFinish && targetFinish >= targetStart) {
        const days: Date[] = [];
        const weights: number[] = [];
        eachDayInclusive(targetStart, targetFinish, (d) => {
          const dd = clampDateRange(d, rangeStart, rangeEnd);
          if (floorToLocalDate(dd).getTime() !== floorToLocalDate(d).getTime()) return;
          if (!cal.isWorkDay(d, clndrId)) return;
          days.push(new Date(d));
          weights.push(cal.dayHours(d, clndrId));
        });

        const sumW = weights.reduce((a, b) => a + b, 0);
        const norm = sumW > 0 ? weights.map(w => w / sumW) : (days.length ? Array(days.length).fill(1 / days.length) : []);

        const curve = curveWeights(days.length, plannedCurve);
        const mixedRaw = norm.map((w, i) => w * (curve[i] ?? 0));
        const mixedSum = mixedRaw.reduce((a, b) => a + b, 0);
        const mixed = mixedSum > 0 ? mixedRaw.map(v => v / mixedSum) : norm;

        for (let i = 0; i < days.length; i++) {
          const u = target_qty * mixed[i];
          const c = includeCost ? computeDailyCost(u, target_qty, target_cost, costPerQty, linked) : 0;
          const period = bucketKey(days[i], opts.bucket);
          addToBucket(period, opts.perResource ? (rsrc_id ?? null) : null, { p: u, a: 0, r: 0 }, { p: c, a: 0, r: 0 });
        }
      }

      // --- Факт ---
      const actWindowStart = actStart ?? null;
      const actWindowEnd = (actFinish ?? dataDate ?? null);
      if (act_qty > 0 && actWindowStart && actWindowEnd && actWindowEnd >= actWindowStart) {
        const days: Date[] = [];
        const weights: number[] = [];
        eachDayInclusive(actWindowStart, actWindowEnd, (d) => {
          const dd = clampDateRange(d, rangeStart, rangeEnd);
          if (floorToLocalDate(dd).getTime() !== floorToLocalDate(d).getTime()) return;
          days.push(new Date(d));
          weights.push(1);
        });
        const sumW = weights.reduce((a, b) => a + b, 0);
        const norm = sumW > 0 ? weights.map(w => w / sumW) : (days.length ? Array(days.length).fill(1 / days.length) : []);
        for (let i = 0; i < days.length; i++) {
          const u = act_qty * norm[i];
          const c = includeCost ? computeDailyCost(u, act_qty, act_cost, costPerQty, linked) : 0;
          const period = bucketKey(days[i], opts.bucket);
          addToBucket(period, opts.perResource ? (rsrc_id ?? null) : null, { p: 0, a: u, r: 0 }, { p: 0, a: c, r: 0 });
        }
      }

      // --- Остаток ---
      const remWindowStart = (dataDate && (!actFinish || dataDate > actFinish)) ? dataDate : (remStart ?? targetStart ?? null);
      const remWindowEnd = remFinish ?? targetFinish ?? null;
      if (remain_qty > 0 && remWindowStart && remWindowEnd && remWindowEnd >= remWindowStart) {
        const days: Date[] = [];
        const weights: number[] = [];
        eachDayInclusive(remWindowStart, remWindowEnd, (d) => {
          const dd = clampDateRange(d, rangeStart, rangeEnd);
          if (floorToLocalDate(dd).getTime() !== floorToLocalDate(d).getTime()) return;
          if (!cal.isWorkDay(d, clndrId)) return;
          days.push(new Date(d));
          weights.push(cal.dayHours(d, clndrId));
        });
        const sumW = weights.reduce((a, b) => a + b, 0);
        const norm = sumW > 0 ? weights.map(w => w / sumW) : (days.length ? Array(days.length).fill(1 / days.length) : []);
        const curve = curveWeights(days.length, remainCurve);
        const mixedRaw = norm.map((w, i) => w * (curve[i] ?? 0));
        const mixedSum = mixedRaw.reduce((a, b) => a + b, 0);
        const mixed = mixedSum > 0 ? mixedRaw.map(v => v / mixedSum) : norm;

        for (let i = 0; i < days.length; i++) {
          const u = remain_qty * mixed[i];
          const c = includeCost ? computeDailyCost(u, remain_qty, remain_cost, costPerQty, linked) : 0;
          const period = bucketKey(days[i], opts.bucket);
          addToBucket(period, opts.perResource ? (rsrc_id ?? null) : null, { p: 0, a: 0, r: u }, { p: 0, a: 0, r: c });
        }
      }
    }

    // 3) Преобразуем map -> массивы, отсортированные по периоду
    const sortPoints = (arr: HistogramPoint[]) =>
      arr.sort((x, y) => (x.period < y.period ? -1 : x.period > y.period ? 1 : ((x.rsrc_id ?? -1) - (y.rsrc_id ?? -1))));

    const overallArr = sortPoints(Array.from(overall.values()));
    const byResObj: Record<number, HistogramPoint[]> = {};
    for (const [rid, map] of Object.entries(byRes)) {
      byResObj[Number(rid)] = sortPoints(Array.from(map.values()));
    }

    // 4) Соберём periods (ось X)
    const periodSet = new Set<string>();
    for (const p of overallArr) periodSet.add(p.period);
    for (const points of Object.values(byResObj)) {
      for (const p of points) periodSet.add(p.period);
    }
    const periods = Array.from(periodSet).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    // 5) Метаданные ресурсов
    const resources: HistogramResource[] = Object.keys(byResObj).map(k => {
      const rid = Number(k);
      const r = rsrcById.get(rid) ?? {};
      const code = String(r['rsrc_code'] ?? r['rsrc_short_name'] ?? r['id'] ?? rid);
      const name = String(r['rsrc_name'] ?? r['name'] ?? code);
      const clndr_id = isFiniteNum(r['clndr_id']) ? Number(r['clndr_id']) : null;
      return { rsrc_id: rid, code, name, clndr_id };
    }).sort((a, b) => a.code.localeCompare(b.code));

    // 6) Построим series (готовые наборы для графика)
    const makeTotals = (pts: HistogramPoint[]) => pts.reduce((acc, p) => {
      acc.planned_qty   += p.planned_qty;
      acc.actual_qty    += p.actual_qty;
      acc.remaining_qty += p.remaining_qty;
      acc.planned_cost  += p.planned_cost;
      acc.actual_cost   += p.actual_cost;
      acc.remaining_cost+= p.remaining_cost;
      return acc;
    }, {
      planned_qty: 0, actual_qty: 0, remaining_qty: 0,
      planned_cost: 0, actual_cost: 0, remaining_cost: 0,
    });

    const data: HistogramSeries[] = [];

    // Overall серия всегда первая
    data.push({
      rsrc_id: null,
      code: 'ALL',
      name: 'All',
      points: overallArr,
      totals: makeTotals(overallArr),
    });

    if (opts.perResource) {
      for (const res of resources) {
        const pts = byResObj[res.rsrc_id] ?? [];
        data.push({
          rsrc_id: res.rsrc_id,
          code: res.code,
          name: `${res.code} — ${res.name}`,
          points: pts,
          totals: makeTotals(pts),
        });
      }
    }

    return {
      overall: overallArr,
      byResource: byResObj,
      data,
      resources,
      periods,
    };
  }
}
