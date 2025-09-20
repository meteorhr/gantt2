// src/app/p6/services/dcma/src/check/check10.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck10Item, DcmaCheck10Result, TaskRow, TaskRsrcRow } from '../../models/dcma.model';
import { parseNum } from '../utils/num.util';

/**
 * Дополнительные опции для Check 10 (Resources).
 * Позволяют изменять порог «минимальная длительность в днях», а также управлять фильтрами.
 */
export type DcmaCheck10Options = {
  includeDetails: boolean;
  detailsLimit: number;
  /** Порог в днях: задачи с эффективной длительностью \u2265 (порог * HPD) попадают в знаменатель. По умолчанию 1 день. */
  durationDayThreshold: number;

  /** Фильтры уровня активностей */
  ignoreMilestoneActivities: boolean;       // исключить вехи
  ignoreLoEActivities: boolean;             // исключить LOE/Hammock/SUMMARY
  ignoreWbsSummaryActivities: boolean;      // исключить WBS summary
  ignoreCompletedActivities: boolean;       // исключить Completed
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck10Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 10 — Resources: все задачи с длительностью ≥ N дней (по умолчанию N=1) должны иметь ресурс(ы)
   *
   * HPD (hours-per-day) всегда берём из календаря задачи (CALENDAR). Третий аргумент — только фолбэк,
   * если календарная норма часов/день недоступна или некорректна.
   */
  async analyzeCheck10(
    projId: number,
    includeDetails: boolean = true,
    fallbackHoursPerDay: number = 8,
    options?: Partial<DcmaCheck10Options>,
  ): Promise<DcmaCheck10Result> {
    const [taskRows, trRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('TASKRSRC') as Promise<TaskRsrcRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>, // для валидации наличия проекта
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // ===== Нормализация опций (дефолты совместимы с прежней логикой) =====
    const opts: DcmaCheck10Options = {
      includeDetails,
      detailsLimit: 500,
      durationDayThreshold: 1,
      ignoreMilestoneActivities: true,
      ignoreLoEActivities: true,
      ignoreWbsSummaryActivities: true,
      ignoreCompletedActivities: false,
      ...(options ?? {}),
    };

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const normType = (t: TaskRow): string => (t.task_type ?? '').trim().toUpperCase();
    const isWbs = (t: TaskRow) => normType(t) === 'TT_WBS';
    const isMile = (t: TaskRow) => {
      const ty = normType(t);
      return ty === 'TT_MILE' || ty === 'TT_STARTMILE' || ty === 'TT_FINMILE';
    };
    const isLoEOrHammock = (t: TaskRow) => {
      const ty = normType(t);
      return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
    };
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    // ===== Индекс назначений по task_id =====
    const rsrcByTask = new Map<number, number>();
    for (const r of (trRows || [])) {
      if (typeof r?.task_id === 'number') {
        rsrcByTask.set(r.task_id, (rsrcByTask.get(r.task_id) ?? 0) + 1);
      }
    }

    // ===== Календарь (HPD) с фолбэками =====
    const calById = new Map<string | number, CALENDARRow>();
    for (const c of (calRows || [])) if (c && c.clndr_id != null) calById.set(c.clndr_id, c);
    let calendarFallbackCount = 0;
    const getHpd = (t: TaskRow): number => {
      const cal = t?.clndr_id != null ? calById.get(t.clndr_id) : undefined;
      const h =
        (cal as any)?.hours_per_day_eff ??
        (cal as any)?.day_hr_cnt ??
        ((cal as any)?.week_hr_cnt != null ? (cal as any).week_hr_cnt / 5 : null) ??
        ((cal as any)?.month_hr_cnt != null ? (cal as any).month_hr_cnt / 21.667 : null) ??
        ((cal as any)?.year_hr_cnt != null ? (cal as any).year_hr_cnt / 260 : null);
      const v = (typeof h === 'number' && h > 0) ? h : fallbackHoursPerDay;
      if (!(typeof h === 'number' && h > 0)) calendarFallbackCount++;
      return v;
    };

    // ===== Нормализация чисел длительности =====
    const toNum = (v: unknown): number | null => parseNum(v);

    let dqMissingDuration = 0;
    let dqNegativeDuration = 0;
    let dqUsedAltDurField = 0;

    const effDurHrs = (t: TaskRow): number | null => {
      const rem  = toNum((t as any).remain_dur_hr_cnt) ?? toNum((t as any).rem_drtn_hr_cnt) ?? toNum((t as any).RemainingDurationHours) ?? toNum((t as any).RemainingDuration);
      const orig = toNum((t as any).orig_dur_hr_cnt)   ?? toNum((t as any).OriginalDurationHours) ?? null;
      const atc  = toNum((t as any).at_complete_drtn_hr_cnt) ?? toNum((t as any).AtCompletionDurationHours) ?? null;
      const act  = toNum((t as any).act_total_drtn_hr_cnt)   ?? toNum((t as any).ActualDurationHours) ?? null;

      if (!isCompleted((t as any).status_code)) {
        if (rem != null) return rem;
        if (atc != null && act != null && atc >= act) { dqUsedAltDurField++; return atc - act; }
        if (orig != null) { dqUsedAltDurField++; return orig; }
        dqMissingDuration++; return null;
      }

      if (atc != null) return atc;
      if (orig != null) return orig;
      if (rem != null) { dqUsedAltDurField++; return rem; }
      if (atc != null && act != null && atc >= act) { dqUsedAltDurField++; return atc - act; }
      dqMissingDuration++; return null;
    };

    // ===== Предфильтрация активностей по опциям =====
    let excludedWbs = 0, excludedMilestones = 0, excludedLoEOrHammock = 0, excludedCompleted = 0;

    const preBase = (tasksInProject || []).slice();
    const baseAfterWbs = opts.ignoreWbsSummaryActivities ? preBase.filter(t => !isWbs(t)) : preBase;
    excludedWbs = preBase.length - baseAfterWbs.length;

    const baseAfterMiles = opts.ignoreMilestoneActivities ? baseAfterWbs.filter(t => !isMile(t)) : baseAfterWbs;
    excludedMilestones = baseAfterWbs.length - baseAfterMiles.length;

    const baseAfterLoE = opts.ignoreLoEActivities ? baseAfterMiles.filter(t => !isLoEOrHammock(t)) : baseAfterMiles;
    excludedLoEOrHammock = baseAfterMiles.length - baseAfterLoE.length;

    const baseSet = opts.ignoreCompletedActivities ? baseAfterLoE.filter(t => !isCompleted((t as any).status_code)) : baseAfterLoE;
    excludedCompleted = baseAfterLoE.length - baseSet.length;

    // ===== Формирование кандидатов: длительность >= thresholdDays * HPD =====
    const candidates: Array<{ t: TaskRow; effHrs: number; hpd: number }> = [];
    for (const t of baseSet) {
      const d = effDurHrs(t);
      if (d == null) continue;
      if (d < 0) { dqNegativeDuration++; continue; }
      const hpd = getHpd(t);
      const thresholdHours = Math.max(0, opts.durationDayThreshold) * hpd;
      if (d >= thresholdHours) candidates.push({ t, effHrs: d, hpd });
    }

    // ===== Фактические «нарушители» — без ресурсов =====
    const without = candidates.filter(c => (rsrcByTask.get(c.t.task_id) ?? 0) <= 0);

    const items: DcmaCheck10Item[] = opts.includeDetails
      ? without.slice(0, Math.max(0, opts.detailsLimit | 0)).map(c => ({
          task_id: c.t.task_id,
          task_code: c.t.task_code,
          task_name: c.t.task_name,
          eff_dur_hr_cnt: c.effHrs,
          eff_dur_days: Math.round((c.effHrs / c.hpd) * 100) / 100,
          hours_per_day_used: c.hpd,
        }))
      : [];

    const totalEligible = candidates.length;
    const withoutResourceCount = without.length;
    const percentWithoutResource = totalEligible > 0 ? Math.round((withoutResourceCount / totalEligible) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      hoursPerDay: fallbackHoursPerDay,
      totalEligible,
      withoutResourceCount,
      percentWithoutResource,
      details: opts.includeDetails ? {
        items,
        dq: {
          excludedWbs,
          excludedMilestones,
          excludedLoEOrHammock,
          excludedCompleted,
          missingDuration: dqMissingDuration,
          negativeDuration: dqNegativeDuration,
          usedAltDurationField: dqUsedAltDurField,
          calendarFallbackCount,
        },
      } : undefined,
    };
  }
}
