// src/app/p6/services/dcma/src/check/check8.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck8Item, DcmaCheck8Result, TaskRow } from '../../models/dcma.model';
import { parseNum } from '../utils/num.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck8Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 8 — High Duration: незавершённые, Remaining Duration > 44 дней (≤5%) */
  async analyzeCheck8(
    projId: number,
    includeDetails: boolean = true,
    hoursPerDay: number = 8,
  ): Promise<DcmaCheck8Result> {
    const [taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>, 
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const excludeLoEAndHammock = true;
    const isLoEOrHammock = (t: TaskRow) => {
      const ty = (t.task_type ?? '').trim().toUpperCase();
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };

    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

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

    const toNum = (v: unknown): number | null => parseNum(v);

    let dqMissingRemain = 0;
    let dqNegativeRemain = 0;
    let dqUsedAltField = 0;

    const getRemainHrs = (t: TaskRow): number | null => {
      // 1) основное поле
      const p1 = toNum((t as any).remain_dur_hr_cnt);
      if (p1 != null) return p1;
      // 2) альтернативы
      const altKeys = ['rem_drtn_hr_cnt', 'RemainingDurationHours', 'RemainingDuration'];
      for (const k of altKeys) {
        const v = toNum((t as any)[k]);
        if (v != null) { dqUsedAltField++; return v; }
      }
      // 3) эвристика: AtCompletion - Actual
      const ac = toNum((t as any).at_complete_drtn_hr_cnt);
      const act = toNum((t as any).act_total_drtn_hr_cnt);
      if (ac != null && act != null && ac >= act) { dqUsedAltField++; return ac - act; }
      dqMissingRemain++;
      return null;
    };

    const notWbs = tasksInProject.filter(t => !isWbs(t));
    let excludedWbs = tasksInProject.length - notWbs.length;

    const nonCompleted = notWbs.filter(t => !isCompleted(t.status_code));
    let excludedCompleted = notWbs.length - nonCompleted.length;

    const baseSet = excludeLoEAndHammock ? nonCompleted.filter(t => !isLoEOrHammock(t)) : nonCompleted;
    let excludedLoEOrHammock = nonCompleted.length - baseSet.length;

    const candidates: Array<{ t: TaskRow; remHrs: number; hpd: number }> = [];
    for (const t of baseSet) {
      const rem = getRemainHrs(t);
      if (rem == null) continue;
      if (rem < 0) { dqNegativeRemain++; continue; }
      const hpd = getHpd(t);
      candidates.push({ t, remHrs: rem, hpd });
    }

    const hi = candidates.filter(c => c.remHrs > (44 * c.hpd));

    const items: DcmaCheck8Item[] = includeDetails
      ? hi.map(c => ({
          task_id: c.t.task_id,
          task_code: c.t.task_code,
          task_name: c.t.task_name,
          remain_dur_hr_cnt: c.remHrs,
          remain_dur_days_8h: Math.round((c.remHrs / c.hpd) * 100) / 100,
          hours_per_day_used: c.hpd,
        }))
      : [];

    const totalEligible = candidates.length;
    const highDurationCount = hi.length;
    const highDurationPercent = totalEligible > 0 ? Math.round((highDurationCount / totalEligible) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalEligible,
      highDurationCount,
      highDurationPercent,
      threshold5PercentExceeded: highDurationPercent > 5,
      details: includeDetails ? { 
        items,
        dq: {
          excludedWbs,
          excludedCompleted,
          excludedLoEOrHammock,
          missingRemainDur: dqMissingRemain,
          negativeRemainDur: dqNegativeRemain,
          usedAltRemainField: dqUsedAltField,
        },
      } : undefined,
    };
  }
}