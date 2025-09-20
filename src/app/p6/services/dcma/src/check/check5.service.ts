import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck5Item, DcmaCheck5Result, TaskRow } from '../../models/dcma.model';
import { ConstraintNorm, isHardConstraint, normalizeConstraintType } from '../utils/constraint.util';

export type DcmaCheck5Options = {
  includeDetails: boolean;
  detailsLimit: number;
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck5Service {
  private readonly dexie = inject(P6DexieService);

  private round2(n: number): number { return Math.round(n * 100) / 100; }

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

  /** DCMA трактовка “hard”: MSO/MFO + SO/FO */
  private isHardBySpec(norm: ConstraintNorm): boolean {
    return isHardConstraint(norm)
      || norm === 'SOFT_START_ON'    // SO → hard по требованиям
      || norm === 'SOFT_FINISH_ON';  // FO → hard по требованиям
  }

  /**
   * Check 5 — Hard Constraints.
   * Считаем одновременно:
   * 1) legacy: hardPercent от totalWithConstraints (hard+soft распознанные ограничения);
   * 2) DCMA:  percentHardAllActivities от totalActivities (все eligible-активности после фильтров).
   */
  async analyzeCheck5(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck5Options>
  ): Promise<DcmaCheck5Result> {
    const [taskRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    ]);

    const hasProject = (projRows || []).some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const all = (taskRows || []).filter(t => t.proj_id === projId);

    const opts: DcmaCheck5Options = {
      includeDetails,
      detailsLimit: 500,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      ...(options ?? {}),
    };

    // === Фильтрация с учётом счётчиков исключений ===
    let excludedWbs = 0, excludedMilestone = 0, excludedLoE = 0, excludedCompleted = 0;
    const eligible: TaskRow[] = [];
    for (const t of all) {
      if (opts.ignoreWbsSummaryActivities && this.isWbs(t)) { excludedWbs++; continue; }
      if (opts.ignoreMilestoneActivities && this.isMilestone(t)) { excludedMilestone++; continue; }
      if (opts.ignoreLoEActivities && this.isLoE(t)) { excludedLoE++; continue; }
      if (opts.ignoreCompletedActivities && this.isCompleted(t)) { excludedCompleted++; continue; }
      eligible.push(t);
    }

    const totalActivities = eligible.length;

    // === Классификация ограничений ===
    const byType: Record<ConstraintNorm, number> = {
      HARD_MS: 0, HARD_MF: 0,
      SOFT_ALAP: 0, SOFT_ASAP: 0,
      SOFT_START_ON: 0, SOFT_START_ON_OR_BEFORE: 0, SOFT_START_ON_OR_AFTER: 0,
      SOFT_FINISH_ON: 0, SOFT_FINISH_ON_OR_BEFORE: 0, SOFT_FINISH_ON_OR_AFTER: 0,
      UNKNOWN: 0,
    };

    const itemsHard: DcmaCheck5Item[] = [];
    const itemsSoft: DcmaCheck5Item[] = [];

    let unknownType = 0;
    let missingDateForHard = 0;
    let missingDateForSoft = 0;
    let noConstraintCount = 0;

    for (const t of eligible) {
      const norm = normalizeConstraintType((t as any).cstr_type);
      byType[norm] = (byType[norm] ?? 0) + 1;

      const hasType = !!(t as any).cstr_type;
      const hasDate = !!(t as any).cstr_date;

      if (!hasType || norm === 'UNKNOWN') {
        unknownType++;
        if (!hasType) noConstraintCount++;
        continue; // не попадает в legacy-знаменатель
      }

      const isHard = this.isHardBySpec(norm);

      const base: DcmaCheck5Item = {
        task_id: t.task_id,
        task_code: t.task_code,
        task_name: t.task_name,
        cstr_type: (t as any).cstr_type,
        cstr_date: (t as any).cstr_date,
        isHard,
        normType: norm,
        hasDate,
      };

      if (isHard) {
        if (!hasDate) missingDateForHard++;
        itemsHard.push(base);
      } else {
        if (!hasDate) missingDateForSoft++;
        itemsSoft.push(base);
      }
    }

    // === Оба знаменателя ===
    const totalWithConstraints = itemsHard.length + itemsSoft.length; // legacy
    const hardCount = itemsHard.length;
    const softCount = itemsSoft.length;

    const hardPercent = totalWithConstraints > 0
      ? this.round2((hardCount / totalWithConstraints) * 100)
      : 0;

    const percentHardAllActivities = totalActivities > 0
      ? this.round2((hardCount / totalActivities) * 100)
      : 0;

    const result: DcmaCheck5Result = {
      proj_id: projId,

      // legacy (как было)
      totalWithConstraints,
      hardCount,
      softCount,
      hardPercent,
      threshold5PercentExceeded: hardPercent > 5,

      // усиление модели — DCMA-метрики от всех eligible-активностей
      totalActivities,
      percentHardAllActivities,
      noConstraintCount,

      details: opts.includeDetails ? {
        hardList: itemsHard.slice(0, Math.max(0, opts.detailsLimit | 0)),
        softList: itemsSoft.slice(0, Math.max(0, opts.detailsLimit | 0)),
        byType,
        dq: {
          unknownType,
          missingDateForHard,
          missingDateForSoft,
          excludedWbs,
          excludedMilestone,
          excludedLoE,
          excludedCompleted,
        },
        filters: {
          ignoreMilestoneActivities: opts.ignoreMilestoneActivities,
          ignoreLoEActivities: opts.ignoreLoEActivities,
          ignoreWbsSummaryActivities: opts.ignoreWbsSummaryActivities,
          ignoreCompletedActivities: opts.ignoreCompletedActivities,
          detailsLimit: opts.detailsLimit,
        }
      } : undefined,
    };

    return result;
  }
}