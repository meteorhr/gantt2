import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import type { TaskRow } from '../../models/dcma.model';
import { normalizeConstraintType, type ConstraintNorm } from '../utils/constraint.util';

export type DcmaCheck5Options = {
  includeDetails: boolean;
  detailsLimit: number;
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;
};

type HardItem = {
  task_id: number;
  task_code?: string;
  task_name?: string;
  cstr_type?: string;
  cstr_date?: string | Date | null;
  normType?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isMilestone(t: TaskRow): boolean {
  const tp = (t.task_type ?? '').trim();
  return tp === 'TT_Mile' || tp === 'TT_StartMile' || tp === 'TT_FinMile';
}

function isLoE(t: TaskRow): boolean {
  return (t.task_type ?? '').trim() === 'TT_LOE';
}

function isWbs(t: TaskRow): boolean {
  return (t.task_type ?? '').trim() === 'TT_WBS';
}

function isCompleted(t: TaskRow): boolean {
  const s = (t.status_code ?? '').toLowerCase();
  return s.includes('complete'); // covers "Completed", "TK_Complete"
}

function isHardForCheck5(norm: ConstraintNorm): boolean {
  // DCMA Check 5 считает жёсткими: MSO/MFO/SO/FO
  return norm === 'HARD_MS' || norm === 'HARD_MF' || norm === 'SOFT_START_ON' || norm === 'SOFT_FINISH_ON';
}

@Injectable({ providedIn: 'root' })
export class DcmaCheck5Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 5 — Hard Constraints ≤ RequiredMaxPct
   * percentHard считается от всех активностей (после применения фильтров).
   * Под "hard" понимаем: MSO/MFO/SO/FO (Start/Finish On также считаем жёсткими).
   *
   * Совместимость: возвращаем и новые поля (percentHard, totalActivities, countHard),
   * и устаревшие (hardPercent, totalWithConstraints, hardCount) с пометкой @deprecated.
   */
  async analyzeCheck5(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck5Options>
  ): Promise<{
    proj_id: number;
    // новые поля
    totalActivities: number;
    countHard: number;
    percentHard: number;
    details?: { items: HardItem[]; hardList?: HardItem[] };
    // совместимость
    /** @deprecated */ totalWithConstraints: number;
    /** @deprecated */ hardCount: number;
    /** @deprecated */ hardPercent: number;
    /** @deprecated */ threshold5PercentExceeded: boolean;
  }> {
    const [taskRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    ]);

    const hasProject = (projRows || []).some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const all = (taskRows || []).filter(t => t.proj_id === projId);

    const opts: DcmaCheck5Options = {
      includeDetails: includeDetails,
      detailsLimit: 500,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      ...(options ?? {}),
    };

    // Фильтрация активностей
    const eligible = all.filter(t => {
      if (opts.ignoreWbsSummaryActivities && isWbs(t)) return false;
      if (opts.ignoreMilestoneActivities && isMilestone(t)) return false;
      if (opts.ignoreLoEActivities && isLoE(t)) return false;
      if (opts.ignoreCompletedActivities && isCompleted(t)) return false;
      return true;
    });

    const totalActivities = eligible.length;

    const hardItems: HardItem[] = [];
    for (const t of eligible) {
      const norm = normalizeConstraintType((t as any).cstr_type);
      if (isHardForCheck5(norm)) {
        hardItems.push({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          cstr_type: (t as any).cstr_type,
          cstr_date: (t as any).cstr_date,
          normType: norm,
        });
      }
    }

    const countHard = hardItems.length;
    const percentHard = totalActivities > 0 ? round2((countHard / totalActivities) * 100) : 0;

    // Совместимость со старой моделью (основанной на "с активными ограничениями"):
    // Пусть totalWithConstraints = countHard + soft (не считаем soft теперь) → для обратной связи проставим значение = countHard.
    // В UI используйте новые поля.
    const legacyTotalWithConstraints = countHard;
    const legacyHardPercent = percentHard;

    const details = opts.includeDetails
      ? { items: hardItems.slice(0, Math.max(0, opts.detailsLimit | 0)), hardList: hardItems.slice(0, Math.max(0, opts.detailsLimit | 0)) }
      : undefined;

    return {
      proj_id: projId,
      totalActivities,
      countHard,
      percentHard,
      details,
      // устаревшие поля — для совместимости
      totalWithConstraints: legacyTotalWithConstraints,
      hardCount: countHard,
      hardPercent: legacyHardPercent,
      threshold5PercentExceeded: legacyHardPercent > 5,
    };
  }
}
