// src/app/p6/services/dcma/src/check/check7.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck7Item, DcmaCheck7Result, TaskRow } from '../../models/dcma.model';
import { parseNum } from '../utils/num.util';

export type DcmaCheck7Options = {
  includeDetails: boolean;
  detailsLimit: number;
  /** Фолбэк часов/день, если календарь задачи не найден */
  hoursPerDay: number;
  /** Допуск по отрицательному флоту (часы). Нарушение, если TF < -toleranceHours. По умолчанию 0. */
  toleranceHours: number;
  /** Фильтры по типам активностей */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck7Service {
  private readonly dexie = inject(P6DexieService);

  private isMilestone(t: TaskRow): boolean {
    const tp = (t.task_type ?? '').trim();
    return tp === 'TT_Mile' || tp === 'TT_StartMile' || tp === 'TT_FinMile';
  }
  private isLoE(t: TaskRow): boolean { return (t.task_type ?? '').trim() === 'TT_LOE'; }
  private isWbs(t: TaskRow): boolean { return (t.task_type ?? '').trim() === 'TT_WBS'; }
  private isCompleted(t: TaskRow): boolean {
    const s = (t.status_code ?? '').toLowerCase();
    return s.includes('complete'); // «Completed», «TK_Complete», и т.п.
  }

  /** DCMA Check 7 — Negative Float: TF < 0 (с настраиваемым допуском) */
  async analyzeCheck7(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck7Options>
  ): Promise<DcmaCheck7Result> {
    const [taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const opts: DcmaCheck7Options = {
      includeDetails,
      detailsLimit: 500,
      hoursPerDay: 8,
      toleranceHours: 0,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      ...(options ?? {}),
    };

    // === Фильтрация по флагам, считаем исключения ===
    let excludedWbs = 0, excludedMilestone = 0, excludedLoE = 0, excludedCompleted = 0;
    const eligible: TaskRow[] = [];
    for (const t of tasksInProject) {
      if (opts.ignoreWbsSummaryActivities && this.isWbs(t)) { excludedWbs++; continue; }
      if (opts.ignoreMilestoneActivities && this.isMilestone(t)) { excludedMilestone++; continue; }
      if (opts.ignoreLoEActivities && this.isLoE(t)) { excludedLoE++; continue; }
      if (opts.ignoreCompletedActivities && this.isCompleted(t)) { excludedCompleted++; continue; }
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
      return (typeof h === 'number' && h > 0) ? h : opts.hoursPerDay;
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

    // Нарушителем считаем TF < -toleranceHours
    const neg = eligible.filter(t => tfHours(t, getHpd(t)) < -Math.max(0, opts.toleranceHours));

    const items: DcmaCheck7Item[] = opts.includeDetails
      ? neg.map(t => {
          const hpd = getHpd(t);
          const tfHrs = tfHours(t, hpd);
          return {
            task_id: t.task_id,
            task_code: t.task_code,
            task_name: t.task_name,
            total_float_hr_cnt: tfHrs,
            total_float_days_8h: Math.round((tfHrs / hpd) * 100) / 100,
            hours_per_day_used: hpd,
          };
        }).slice(0, Math.max(0, opts.detailsLimit | 0))
      : [];

    return {
      proj_id: projId,
      totalEligible: eligible.length,
      negativeFloatCount: neg.length,
      hasNegativeFloat: neg.length > 0,
      details: opts.includeDetails
        ? {
            items,
            dq: { unknownUnits: dqUnknownUnits, missingTf: dqMissingTf, excludedWbs },
          }
        : undefined,
    };
  }
}
