// src/app/p6/services/dcma/src/check/check11.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck11Item, DcmaCheck11Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, dayUTC } from '../utils/date.util';

/**
 * Опции для DCMA Check 11 (Missed Tasks). Позволяют настраивать порог процента и фильтры.
 */
export type DcmaCheck11Options = {
  /** Включать подробные списки нарушителей */
  includeDetails: boolean;
  /** Лимит элементов в списке деталей */
  detailsLimit: number;
  /** Порог DCMA: доля завершённых с AF > BL Finish должна быть ≤ requiredMaxPct (по умолчанию 5%) */
  requiredMaxPct: number;

  /** Фильтры уровня активностей (применяются до формирования множества completed) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  /** Обычно для Check 11 не используется, но оставлено для унификации */
  ignoreCompletedActivities: boolean;
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck11Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 11 — Missed Tasks: среди завершённых задач доля AF > Baseline Finish должна быть ≤ requiredMaxPct (по умолчанию 5%).
   */
  async analyzeCheck11(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck11Options>,
  ): Promise<DcmaCheck11Result> {
    const [taskRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const all = (taskRows || []).filter(t => t.proj_id === projId);

    // ===== Нормализация опций (совместимость с прежней сигнатурой) =====
    const opts: DcmaCheck11Options = {
      includeDetails,
      detailsLimit: 500,
      requiredMaxPct: 5,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      ...(options ?? {}),
    };

    // ===== Предикаты типов работ =====
    const normType = (t: TaskRow): string => (t.task_type ?? '').trim().toUpperCase();
    const isWbs = (t: TaskRow) => normType(t) === 'TT_WBS';
    const isMilestone = (t: TaskRow) => {
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

    // ===== Фильтрация (без изменения интерфейса результатов) =====
    const base0 = all;
    const base1 = opts.ignoreWbsSummaryActivities ? base0.filter(t => !isWbs(t)) : base0;
    const base2 = opts.ignoreMilestoneActivities ? base1.filter(t => !isMilestone(t)) : base1;
    const base3 = opts.ignoreLoEActivities ? base2.filter(t => !isLoEOrHammock(t)) : base2;
    const base  = opts.ignoreCompletedActivities ? base3.filter(t => !isCompleted((t as any).status_code)) : base3;

    // ===== Выбор завершённых из базы после фильтров =====
    const completed = base.filter(t => isCompleted((t as any).status_code));
    const totalCompleted = completed.length;

    // ===== Выборка задач, у которых есть и BL Finish, и AF (минимальные требования) =====
    const BL_FIELDS: (keyof TaskRow | string)[] = [
      'bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'
    ];
    const getBaselineFinish = (t: TaskRow, usage?: Record<string, number>): Date | null => {
      for (const k of BL_FIELDS) {
        const d = toDateStrict((t as any)[k]);
        if (d) { if (usage) usage[String(k)] = (usage[String(k)] ?? 0) + 1; return d; }
      }
      return null;
    };

    const baselineUsage: Record<string, number> = {};
    let missingBaselineFinish = 0;
    let missingActualFinish = 0;
    const evaluated: TaskRow[] = [];

    for (const t of completed) {
      const bl = getBaselineFinish(t, baselineUsage);
      if (!bl) { missingBaselineFinish++; continue; }
      const af = toDateStrict((t as any).act_end_date);
      if (!af) { missingActualFinish++; continue; }
      evaluated.push(t);
    }

    // ===== Подсчёт нарушителей (AF > BL Finish) =====
    const items: DcmaCheck11Item[] = [];
    let missedCount = 0;

    for (const t of evaluated) {
      const bl = getBaselineFinish(t)!;
      const af = toDateStrict((t as any).act_end_date)!;
      const blDay = dayUTC(bl);
      const afDay = dayUTC(af);
      if (afDay > blDay) {
        missedCount++;
        if (opts.includeDetails) {
          items.push({
            task_id: t.task_id,
            task_code: t.task_code,
            task_name: t.task_name,
            act_finish: (t as any).act_end_date,
            baseline_finish: (t as any).bl1_finish_date ?? (t as any).bl_finish_date ?? (t as any).baseline_finish_date ?? (t as any).target_end_date ?? (t as any).target_finish_date ?? null,
          });
        }
      }
    }

    // обрезка деталей по лимиту
    const limitedItems = opts.includeDetails ? items.slice(0, Math.max(0, opts.detailsLimit | 0)) : [];

    const evaluatedCompleted = evaluated.length;
    const missedPercent = evaluatedCompleted > 0 ? Math.round((missedCount / evaluatedCompleted) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalCompleted,
      evaluatedCompleted,
      missedCount,
      missedPercent,
      // сохраняем поле имени для обратной совместимости, но сравниваем с настраиваемым порогом
      threshold5PercentExceeded: missedPercent > (Number.isFinite(opts.requiredMaxPct) ? opts.requiredMaxPct : 5),
      details: opts.includeDetails ? {
        items: limitedItems,
        dq: { excludedWbs: all.length - base1.length, missingBaselineFinish, missingActualFinish, baselineFieldUsage: baselineUsage },
      } : undefined,
    };
  }
}
