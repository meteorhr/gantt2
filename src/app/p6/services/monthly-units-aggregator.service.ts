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
    AtCompletionUnits: number; // Actual + Remaining (в режиме 'cost' — стоимость)
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
  /** Режим агрегации: по количествам (units) или по стоимости (cost) */
  mode?: 'units' | 'cost';          // default 'units'
  /** Чем сортировать ресурсы внутри месяца */
  resourceOrder?: 'name' | 'Budgeted' | 'Actual' | 'Remaining' | 'AtCompletionUnits'; // default 'name'
  /** Порядок сортировки */
  desc?: boolean;                   // default false (по возрастанию)
  /** Добавлять колонку 'UNASSIGNED' (неназначенные ресурсы = Overall − сумма назначенных) */
  includeUnassigned?: boolean;     // default true
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
    const mode: 'units' | 'cost' = opts?.mode ?? 'units';
    const includeUnassigned = opts?.includeUnassigned !== false;

    const result = await this.hist.buildHistogram({
      bucket: 'day',                 // максимум детализации
      perResource: true,             // чтобы были ряды по каждому ресурсу
      rangeStart: opts?.rangeStart ?? null,
      rangeEnd: opts?.rangeEnd ?? null,
      includeCost: mode === 'cost',  // для режима cost просим стоимость
    });

    if (mode === 'cost') {
      const sample = (result?.data?.[1]?.points?.[0]) || (result?.data?.[0]?.points?.[0]);
      const hasCost = sample && (('planned_cost' in sample) || ('actual_cost' in sample) || ('remaining_cost' in sample) || ('cost' in sample) || ('value_cost' in sample) || ('total_cost' in sample));
      if (!hasCost) {
        console.warn('[MonthlyUnitsAggregator] В режиме cost: не найдены cost-поля в histogram points. Проверьте, что HistogramService возвращает *_cost при includeCost=true.');
      }
    }

    // Выбор источника значений по режиму (строгий cost без падения на generic поля)
    const pickCost = (p: any, qty: number): number => {
      // Частые ключи из HistogramService/TaskRsrc
      const direct = p.planned_cost ?? p.actual_cost ?? p.remaining_cost ?? p.cost;
      if (direct != null) return num(direct);
      // Альтернативные наименования из разных реализаций
      const alt = p.cost_planned ?? p.cost_actual ?? p.cost_remaining ?? p.value_cost ?? p.total_cost;
      if (alt != null) return num(alt);
      // Попробуем расчёт: qty * rate (если известна ставка)
      const rate = p.unit_rate ?? p.price ?? p.cost_per_unit ?? null;
      if (rate != null) return num(qty) * num(rate);
      return 0;
    };

    const getPlanned = (p: any) => {
      if (mode === 'cost') {
        const q = num(p.planned_qty ?? p.planned ?? 0);
        const v = p.planned_cost ?? p.cost_planned ?? null;
        return v != null ? num(v) : pickCost(p, q);
      } else {
        return num(p.planned_qty ?? p.planned ?? 0);
      }
    };

    const getActual = (p: any) => {
      if (mode === 'cost') {
        const q = num(p.actual_qty ?? p.actual ?? 0);
        const v = p.actual_cost ?? p.cost_actual ?? null;
        return v != null ? num(v) : pickCost(p, q);
      } else {
        return num(p.actual_qty ?? p.actual ?? 0);
      }
    };

    const getRemain = (p: any) => {
      if (mode === 'cost') {
        const q = num(p.remaining_qty ?? p.remaining ?? 0);
        const v = p.remaining_cost ?? p.cost_remaining ?? null;
        return v != null ? num(v) : pickCost(p, q);
      } else {
        return num(p.remaining_qty ?? p.remaining ?? 0);
      }
    };

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

    // Overall по периодам (для вычисления UNASSIGNED)
    const overallByPeriod = new Map<string, { B: number; A: number; R: number }>();
    if (includeUnassigned && result.data?.[0]?.points?.length) {
      for (const p of result.data[0].points) {
        const key = bucketOut === 'month' ? toMonth(p.period) : toYear(p.period);
        const prev = overallByPeriod.get(key) ?? { B: 0, A: 0, R: 0 };
        prev.B += getPlanned(p);
        prev.A += getActual(p);
        prev.R += getRemain(p);
        overallByPeriod.set(key, prev);
        // Учтём периоды даже если нет назначенных серий — чтобы UNASSIGNED появился
        inputPeriods.add(key);
      }
    }

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

        acc.Budgeted += getPlanned(p);
        acc.Actual   += getActual(p);
        acc.Remaining+= getRemain(p);
      }
    }

    // Хелпер: если в строке уже есть реальный ресурс с названием "UNASSIGNED" — подберём безопасный ключ
    const resolveUnassignedKey = (row: Map<string, { Budgeted: number; Actual: number; Remaining: number }>): string => {
      let base = 'UNASSIGNED';
      if (!row.has(base)) return base;
      // попробуем вариант с пометкой
      base = 'UNASSIGNED (auto)';
      if (!row.has(base)) return base;
      // финально — добавляем звездочки, пока не найдём свободный ключ
      let i = 1;
      let key = `${base}*`;
      while (row.has(key)) {
        i++;
        key = `${base}${'*'.repeat(i)}`;
      }
      return key;
    };

    // 3.1) Добавим 'UNASSIGNED' = Overall − сумма назначенных (неназначенные ресурсы)
    if (includeUnassigned && series.length > 0 && overallByPeriod.size > 0) {
      for (const per of inputPeriods) {
        const ov = overallByPeriod.get(per) ?? { B: 0, A: 0, R: 0 };
        // сумма назначенных по периоду
        const row = byPeriod.get(per) ?? new Map<string, { Budgeted: number; Actual: number; Remaining: number }>();
        let sumB = 0, sumA = 0, sumR = 0;
        for (const acc of row.values()) {
          sumB += acc.Budgeted;
          sumA += acc.Actual;
          sumR += acc.Remaining;
        }
        const dB = ov.B - sumB;
        const dA = ov.A - sumA;
        const dR = ov.R - sumR;
        // добавляем только если есть значимая разница (игнорируем микроскопические ошибки округления)
        if (Math.abs(dB) > 1e-9 || Math.abs(dA) > 1e-9 || Math.abs(dR) > 1e-9) {
          if (!byPeriod.has(per)) byPeriod.set(per, new Map());
          const m = byPeriod.get(per)!;
          const key = resolveUnassignedKey(m);
          if (!m.has(key)) m.set(key, { Budgeted: 0, Actual: 0, Remaining: 0 });
          const acc = m.get(key)!;
          acc.Budgeted += dB;
          acc.Actual   += dA;
          acc.Remaining+= dR;
        }
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

        acc.Budgeted += getPlanned(p);
        acc.Actual   += getActual(p);
        acc.Remaining+= getRemain(p);
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
        const AtCompletionUnits = acc.Actual + acc.Remaining; // в режиме 'cost' — сумма стоимостей
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