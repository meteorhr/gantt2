// src/app/p6/services/dcma/src/check/check8.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { CALENDARRow } from '../../../../models';
import { DcmaCheck8Item, DcmaCheck8Result, TaskRow } from '../../models/dcma.model';
import { parseNum } from '../utils/num.util';

export type DcmaCheck8Options = {
  /** Включать подробный список нарушителей */
  includeDetails: boolean;
  /** Максимум элементов в деталях */
  detailsLimit: number;
  /** Фолбэк часов/день, если календарь задачи не найден */
  hoursPerDay: number;
  /** Порог высокой оставшейся длительности в ДНЯХ (по календарю задачи) */
  thresholdDays: number; // по DCMA 44
  /** Пороговые значения для процента нарушителей: Pass основывается на requiredMaxPct */
  thresholds: { requiredMaxPct: number; averageMaxPct: number; greatMaxPct: number };

  /** Фильтры по типам активностей */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;        // включает Hammock/SUMMARY как LOE-семейство
  ignoreWbsSummaryActivities: boolean; // исключать WBS summary из расчёта
  ignoreCompletedActivities: boolean;  // исключать Completed
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck8Service {
  private readonly dexie = inject(P6DexieService);

  private isMilestone(t: TaskRow): boolean {
    const tp = (t.task_type ?? '').trim();
    return tp === 'TT_Mile' || tp === 'TT_StartMile' || tp === 'TT_FinMile';
  }
  private isLoEOrHammock(t: TaskRow): boolean {
    const ty = (t.task_type ?? '').trim().toUpperCase();
    return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
  }
  private isWbs(t: TaskRow): boolean { return (t.task_type ?? '').trim() === 'TT_WBS'; }
  private isCompleted(v: unknown): boolean {
    const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
    return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
  }

  /** DCMA Check 8 — High Duration: незавершённые, Remaining Duration > thresholdDays (по умолчанию 44), доля ≤ requiredMaxPct% */
  async analyzeCheck8(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck8Options> | number, // number = hoursPerDay (для обратной совместимости)
  ): Promise<DcmaCheck8Result> {
    const [taskRows, projRows, calRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>, 
      this.dexie.getRows('CALENDAR') as Promise<CALENDARRow[]>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // Нормализация опций (с поддержкой старого сигнатура hoursPerDay)
    const opts: DcmaCheck8Options = {
      includeDetails,
      detailsLimit: 500,
      hoursPerDay: typeof options === 'number' ? options : 8,
      thresholdDays: (typeof options === 'object' && options?.thresholdDays != null)
        ? Number(options.thresholdDays)
        : 44,
      thresholds: (typeof options === 'object' && options?.thresholds)
        ? {
            requiredMaxPct: Number(options.thresholds.requiredMaxPct ?? 5.0),
            averageMaxPct: Number(options.thresholds.averageMaxPct ?? 5.0),
            greatMaxPct:   Number(options.thresholds.greatMaxPct   ?? 2.0),
          }
        : { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 2.0 },
      ignoreMilestoneActivities: (typeof options === 'object' ? !!options.ignoreMilestoneActivities : false),
      ignoreLoEActivities:        (typeof options === 'object' ? !!options.ignoreLoEActivities        : false),
      ignoreWbsSummaryActivities: (typeof options === 'object' ? !!options.ignoreWbsSummaryActivities : false),
      ignoreCompletedActivities:  (typeof options === 'object' ? !!options.ignoreCompletedActivities  : false),
      ...(typeof options === 'object' ? options : {}),
    } as DcmaCheck8Options;

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // === Календарь и HPD ===
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

    // === Флаги качества данных ===
    const toNum = (v: unknown): number | null => parseNum(v);
    let dqMissingRemain = 0;
    let dqNegativeRemain = 0;
    let dqUsedAltField = 0;

    const getRemainHrs = (t: TaskRow): number | null => {
      // 1) основное поле (часы)
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

    // === Фильтры ===
    let excludedWbs = 0, excludedCompleted = 0, excludedLoEOrHammock = 0; // в DQ у нас такие поля
    const eligible: TaskRow[] = [];
    for (const t of tasksInProject) {
      if (opts.ignoreWbsSummaryActivities && this.isWbs(t)) { excludedWbs++; continue; }
      if (opts.ignoreMilestoneActivities && this.isMilestone(t)) { continue; }
      if (opts.ignoreLoEActivities && this.isLoEOrHammock(t)) { excludedLoEOrHammock++; continue; }
      if (opts.ignoreCompletedActivities && this.isCompleted(t.status_code)) { excludedCompleted++; continue; }
      eligible.push(t);
    }

    // === Кандидаты (незавершённые + валидный Remaining Duration) ===
    const nonCompleted = eligible.filter(t => !this.isCompleted(t.status_code));

    const candidates: Array<{ t: TaskRow; remHrs: number; hpd: number }> = [];
    for (const t of nonCompleted) {
      const rem = getRemainHrs(t);
      if (rem == null) continue;
      if (rem < 0) { dqNegativeRemain++; continue; }
      const hpd = getHpd(t);
      candidates.push({ t, remHrs: rem, hpd });
    }

    // === Порог по дням (с учётом HPD) ===
    const hi = candidates.filter(c => c.remHrs > (opts.thresholdDays * c.hpd));

    const items: DcmaCheck8Item[] = opts.includeDetails
      ? hi.slice(0, Math.max(0, opts.detailsLimit | 0)).map(c => ({
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
      // Pass опирается на requiredMaxPct из настроек (по умолчанию 5%)
      threshold5PercentExceeded: highDurationPercent > opts.thresholds.requiredMaxPct,
      details: opts.includeDetails ? { 
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