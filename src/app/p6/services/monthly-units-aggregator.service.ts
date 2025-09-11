import { Injectable } from '@angular/core';
import { HistogramService } from './histogram.service'; // положите рядом с вашим HistogramService
// Если у вас другой путь — смените import на фактический. Остальной код менять не нужно.

/** Выходной формат — как просили */
export type MonthlyUnitsRow = {
  date: string; // 'YYYY-MM' или 'YYYY'
  units: Array<{
    resource: string;
    Budgeted: number;
    Actual: number;
    Remaining: number;
    AtCompletionUnits: number; // Actual + Remaining
  }>;
};

export type MonthlyUnitsOptions = {
  /** Разрешённые корзины агрегации */
  bucket?: 'month' | 'year';        // default 'month'
  /** Ограничение дат (включительно) — передадим в HistogramService */
  rangeStart?: Date | null;
  rangeEnd?: Date | null;
  /** Добавлять пустые месяцы (без ресурсов) в диапазоне */
  zeroFill?: boolean;               // default false
  /** Чем сортировать ресурсы внутри месяца */
  resourceOrder?: 'name' | 'Budgeted' | 'Actual' | 'Remaining' | 'AtCompletionUnits'; // default 'name'
  /** Порядок сортировки */
  desc?: boolean;                   // default false (по возрастанию)
};

@Injectable({ providedIn: 'root' })
export class MonthlyUnitsAggregatorService {

  constructor(private readonly hist: HistogramService) {}

  /**
   * Строит JSON: [{ date: 'YYYY-MM'|'YYYY', units: [{resource, Budgeted, Actual, Remaining, AtCompletionUnits}] }]
   * Источник — HistogramService (он уже умеет A/B: daily spread есть/нет).
   */
  async buildMonthlyUnits(opts?: MonthlyUnitsOptions): Promise<MonthlyUnitsRow[]> {
    const bucketOut: 'month' | 'year' = opts?.bucket ?? 'month';
    const zeroFill = !!opts?.zeroFill;
    const resourceOrder = opts?.resourceOrder ?? 'name';
    const desc = !!opts?.desc;

    // 1) Получаем детальную гистограмму по ДНЯМ и по РЕСУРСАМ (это важно для качественной агрегации)
    const result = await this.hist.buildHistogram({
      bucket: 'day',                 // максимум детализации
      perResource: true,             // чтобы были ряды по каждому ресурсу
      rangeStart: opts?.rangeStart ?? null,
      rangeEnd: opts?.rangeEnd ?? null,
      includeCost: false,            // сейчас считаем только Units, стоимость не нужна
    });

    // Справочник ресурсов: rid -> {code,name}
    const nameByRid = new Map<number, string>();
    for (const r of (result.resources ?? [])) {
      nameByRid.set(r.rsrc_id, r.name || r.code || String(r.rsrc_id));
    }

    // 2) Готовим аккумулятор: period -> (resourceName -> {B,A,R})
    type Acc = { Budgeted: number; Actual: number; Remaining: number; };
    const byPeriod = new Map<string, Map<string, Acc>>();

    // В result.data: [0] — overall, далее — по ресурсам
    const series = result.data?.slice(1) ?? []; // только ресурсные серии
    const inputPeriods = new Set<string>();

    for (const s of series) {
      const rid = s.rsrc_id;
      if (rid == null) continue;
      const resName = nameByRid.get(rid) ?? String(rid);

      for (const p of (s.points ?? [])) {
        const monthKey = bucketOut === 'month' ? toMonth(p.period) : toYear(p.period);
        inputPeriods.add(monthKey);

        if (!byPeriod.has(monthKey)) byPeriod.set(monthKey, new Map());
        const row = byPeriod.get(monthKey)!;

        if (!row.has(resName)) row.set(resName, { Budgeted: 0, Actual: 0, Remaining: 0 });
        const acc = row.get(resName)!;

        acc.Budgeted += num(p.planned_qty);
        acc.Actual   += num(p.actual_qty);
        acc.Remaining+= num(p.remaining_qty);
      }
    }

    // 3) Если нет ресурсных серий (редкий случай), деградируем на overall
    if (!series.length && result.data?.[0]?.points?.length) {
      const resName = 'ALL';
      for (const p of result.data[0].points) {
        const monthKey = bucketOut === 'month' ? toMonth(p.period) : toYear(p.period);
        inputPeriods.add(monthKey);

        if (!byPeriod.has(monthKey)) byPeriod.set(monthKey, new Map());
        const row = byPeriod.get(monthKey)!;

        if (!row.has(resName)) row.set(resName, { Budgeted: 0, Actual: 0, Remaining: 0 });
        const acc = row.get(resName)!;

        acc.Budgeted += num(p.planned_qty);
        acc.Actual   += num(p.actual_qty);
        acc.Remaining+= num(p.remaining_qty);
      }
    }

    // 4) Сформируем упорядоченный список периодов
    const periods = Array.from(inputPeriods).sort();

    // 5) Заполним JSON
    const output: MonthlyUnitsRow[] = [];
    for (const per of periods) {
      const row = byPeriod.get(per);
      if (!row || row.size === 0) {
        if (zeroFill) output.push({ date: per, units: [] });
        continue;
      }

      // Преобразуем Map -> массив и посчитаем AtCompletion
      let units = Array.from(row.entries()).map(([resource, acc]) => {
        const AtCompletionUnits = acc.Actual + acc.Remaining;
        return { resource, Budgeted: fix(acc.Budgeted), Actual: fix(acc.Actual), Remaining: fix(acc.Remaining), AtCompletionUnits: fix(AtCompletionUnits) };
      });

      // Сортировка ресурсов в месяце
      units.sort((a, b) => {
        const key = resourceOrder;
        const av = key === 'name' ? a.resource : (a as any)[key];
        const bv = key === 'name' ? b.resource : (b as any)[key];
        const cmp = (typeof av === 'string' && typeof bv === 'string')
          ? av.localeCompare(bv)
          : (Number(bv) - Number(av)); // по числам — по убыванию
        return desc ? -cmp : cmp;
      });

      output.push({ date: per, units });
    }

    return output;
  }
}

/* ==================== Утилиты ==================== */

function toMonth(period: string): string {
  // 'YYYY-MM' | 'YYYY-MM-DD' -> 'YYYY-MM'
  // 'YYYY' -> 'YYYY-01'
  if (!period) return '';
  if (period.length >= 7) return period.slice(0, 7);
  return `${period}-01`;
}

function toYear(period: string): string {
  // 'YYYY-..' -> 'YYYY'
  if (!period) return '';
  return period.slice(0, 4);
}

function num(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Округление до 1e-10 и отбрасывание "-0" */
function fix(v: number): number {
  const x = Math.abs(v) < 1e-10 ? 0 : v;
  return Number.isFinite(x) ? x : 0;
}