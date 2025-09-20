import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck6Item, DcmaCheck6Result, TaskRow } from '../../models/dcma.model';
import { parseNum } from '../utils/num.util';

/** Опции Check 6 (включая фильтры и KPI-пороги) */
export type DcmaCheck6Options = {
  /** Возвращать подробности по найденным задачам */
  includeDetails: boolean;
  /** Ограничение на размер списка деталей */
  detailsLimit: number;
  /** Фолбэк «часов в дне», если календарь не дал валидное значение */
  fallbackHoursPerDay: number;
  /** Порог «High Float» в ДНЯХ (по DCMA типично 44) */
  dayThreshold: number;
  /** KPI/Pass-пороги (Pass сравнивается с requiredMaxPct) */
  thresholds: { requiredMaxPct: number; averageMaxPct: number; greatMaxPct: number };

  /** Фильтры по активностям (исключения из знаменателя) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck6Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 6 — High Float (> N дней) ≤ P%
   * HPD (hours per day) всегда берём из календарей задачи (CALENDAR). Если календарь
   * не содержит валидного значения, используем настраиваемый фолбэк fallbackHoursPerDay.
   */
  async analyzeCheck6(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck6Options>,
  ): Promise<DcmaCheck6Result> {
    // Сбор опций с безопасными дефолтами. Поддерживаем обратную совместимость с устаревшим `hoursPerDay`.
    const fallbackHPD = (options as any)?.fallbackHoursPerDay ?? (options as any)?.hoursPerDay ?? 8;
    const opts: DcmaCheck6Options = {
      includeDetails,
      detailsLimit: 500,
      fallbackHoursPerDay: fallbackHPD,
      dayThreshold: options?.dayThreshold ?? 44,
      thresholds: options?.thresholds ?? { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 2.0 },

      ignoreMilestoneActivities: options?.ignoreMilestoneActivities ?? false,
      ignoreLoEActivities: options?.ignoreLoEActivities ?? false,
      ignoreWbsSummaryActivities: options?.ignoreWbsSummaryActivities ?? false,
      ignoreCompletedActivities: options?.ignoreCompletedActivities ?? false,
    };

    const [taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Классификаторы типов
    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const isMilestone = (t: TaskRow) => {
      const tp = (t.task_type ?? '').trim();
      return tp === 'TT_Mile' || tp === 'TT_StartMile' || tp === 'TT_FinMile';
    };
    const isLoE = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_LOE');
    const isCompleted = (t: TaskRow) => (t.status_code ?? '').toLowerCase().includes('complete');

    // Фильтрация eligible с учётом опций
    let excludedWbs = 0;
    const eligible: TaskRow[] = [];
    for (const t of tasksInProject) {
      // WBS Summary — не является активностью; из знаменателя исключаем всегда
      if (isWbs(t)) { excludedWbs++; continue; }
      if (opts.ignoreMilestoneActivities && isMilestone(t)) continue;
      if (opts.ignoreLoEActivities && isLoE(t)) continue;
      if (opts.ignoreCompletedActivities && isCompleted(t)) continue;
      eligible.push(t);
    }

    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);

    const getHpd = (t: TaskRow): number => {
      const cal = t?.clndr_id != null ? calById.get(t.clndr_id) : undefined;
      const h =
        (cal as any)?.hours_per_day_eff ??
        (cal as any)?.day_hr_cnt ??
        ((cal as any)?.week_hr_cnt != null ? (cal as any).week_hr_cnt / 5 : null) ??
        ((cal as any)?.month_hr_cnt != null ? (cal as any).month_hr_cnt / 21.667 : null) ??
        ((cal as any)?.year_hr_cnt != null ? (cal as any).year_hr_cnt / 260 : null);
      return (typeof h === 'number' && h > 0) ? h : opts.fallbackHoursPerDay;
    };

    let dqUnknownUnits = 0;
    let dqMissingTf = 0;

    const tfHours = (t: TaskRow, hpd: number): number => {
      const tfHrsField = parseNum((t as any).total_float_hr_cnt);
      if (tfHrsField != null) return tfHrsField;

      const tfRaw = parseNum((t as any).TotalFloat);
      if (tfRaw == null) { dqMissingTf++; return 0; }

      const u0 = String((t as any).TotalFloatUnits ?? '').trim().toUpperCase();
      if (!u0 || u0 === 'H' || u0 === 'HR' || u0 === 'HRS' || u0 === 'HOUR' || u0 === 'HOURS') return tfRaw;       // часы
      if (u0 === 'D' || u0 === 'DAY' || u0 === 'DAYS') return tfRaw * hpd;                                          // дни → часы
      if (u0 === 'W' || u0 === 'WK' || u0 === 'WKS' || u0 === 'WEEK' || u0 === 'WEEKS') return tfRaw * hpd * 5;     // недели
      if (u0 === 'MO' || u0 === 'MON' || u0 === 'MONS' || u0 === 'MONTH' || u0 === 'MONTHS') return tfRaw * hpd * 21.667;
      if (u0 === 'Y' || u0 === 'YR' || u0 === 'YRS' || u0 === 'YEAR' || u0 === 'YEARS') return tfRaw * hpd * 260;
      dqUnknownUnits++; return 0;
    };

    // Выбор high float по настраиваемому порогу в днях (по календарю задачи)
    const hi = eligible.filter(t => {
      const hpd = getHpd(t);
      const tfHrs = tfHours(t, hpd);
      return tfHrs > (opts.dayThreshold * hpd);
    });

    // Детали (с обрезкой до detailsLimit)
    let items: DcmaCheck6Item[] = [];
    if (opts.includeDetails) {
      const mapped = hi.map(t => {
        const hpd = getHpd(t);
        const tfHrs = tfHours(t, hpd);
        return {
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          total_float_hr_cnt: tfHrs ?? 0,
          total_float_days_8h: Math.round((tfHrs / hpd) * 100) / 100, // дни по календарю задачи
          hours_per_day_used: hpd,
        } as DcmaCheck6Item;
      });
      const lim = Math.max(0, opts.detailsLimit | 0);
      items = lim > 0 ? mapped.slice(0, lim) : mapped;
    }

    const totalEligible = eligible.length;
    const highFloatCount = hi.length;
    const highFloatPercent = totalEligible > 0 ? Math.round((highFloatCount / totalEligible) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalEligible,
      highFloatCount,
      highFloatPercent,
      // Pass-флаг по настраиваемому requiredMaxPct (для обратной совместимости имя поля не меняем)
      threshold5PercentExceeded: highFloatPercent > opts.thresholds.requiredMaxPct,
      details: opts.includeDetails ? {
        items,
        dq: { unknownUnits: dqUnknownUnits, missingTf: dqMissingTf, excludedWbs },
      } : undefined,
    };
  }
}