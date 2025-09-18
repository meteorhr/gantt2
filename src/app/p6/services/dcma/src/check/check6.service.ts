// src/app/p6/services/dcma/src/check/check6.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck6Item, DcmaCheck6Result, TaskRow } from '../../models/dcma.model';
import { parseNum } from '../utils/num.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck6Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 6 — High Float (> 44 дней) ≤ 5% */
  async analyzeCheck6(
    projId: number,
    includeDetails: boolean = true,
    hoursPerDay: number = 8,
  ): Promise<DcmaCheck6Result> {
    const [taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>, 
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const eligible = tasksInProject.filter(t => !isWbs(t));
    const excludedWbs = tasksInProject.length - eligible.length;

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
      return (typeof h === 'number' && h > 0) ? h : hoursPerDay;
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

    const hi = eligible.filter(t => {
      const hpd = getHpd(t);
      const tfHrs = tfHours(t, hpd);
      return tfHrs > (44 * hpd);
    });

    const items: DcmaCheck6Item[] = includeDetails
      ? hi.map(t => {
          const hpd = getHpd(t);
          const tfHrs = tfHours(t, hpd);
          return {
            task_id: t.task_id,
            task_code: t.task_code,
            task_name: t.task_name,
            total_float_hr_cnt: tfHrs ?? 0,
            total_float_days_8h: Math.round((tfHrs / hpd) * 100) / 100,
            hours_per_day_used: hpd,
          };
        })
      : [];

    const totalEligible = eligible.length;
    const highFloatCount = hi.length;
    const highFloatPercent = totalEligible > 0 ? Math.round((highFloatCount / totalEligible) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalEligible,
      highFloatCount,
      highFloatPercent,
      threshold5PercentExceeded: highFloatPercent > 5,
      details: includeDetails ? { 
        items,
        dq: { unknownUnits: dqUnknownUnits, missingTf: dqMissingTf, excludedWbs },
      } : undefined,
    };
  }
}
