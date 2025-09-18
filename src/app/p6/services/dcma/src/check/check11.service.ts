// src/app/p6/services/dcma/src/check/check11.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck11Item, DcmaCheck11Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, dayUTC } from '../utils/date.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck11Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 11 — Missed Tasks: среди завершённых задач доля AF > Baseline Finish должна быть ≤ 5%.
   */
  async analyzeCheck11(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck11Result> {
    const [taskRows, projRows] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<{ proj_id: number }>>,
    ]);

    const hasProject = projRows.some(p => p.proj_id === projId);
    if (!hasProject) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

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

    const notWbs = tasksInProject.filter(t => !isWbs(t));
    const excludedWbs = tasksInProject.length - notWbs.length;

    const completed = notWbs.filter(t => isCompleted((t as any).status_code));
    const totalCompleted = completed.length;

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

    const items: DcmaCheck11Item[] = [];
    let missedCount = 0;

    for (const t of evaluated) {
      const bl = getBaselineFinish(t);
      const af = toDateStrict((t as any).act_end_date)!;
      const blDay = dayUTC(bl!);
      const afDay = dayUTC(af);
      if (afDay > blDay) {
        missedCount++;
        if (includeDetails) {
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

    const evaluatedCompleted = evaluated.length;
    const missedPercent = evaluatedCompleted > 0 ? Math.round((missedCount / evaluatedCompleted) * 10000) / 100 : 0;

    return {
      proj_id: projId,
      totalCompleted,
      evaluatedCompleted,
      missedCount,
      missedPercent,
      threshold5PercentExceeded: missedPercent > 5,
      details: includeDetails ? {
        items,
        dq: { excludedWbs, missingBaselineFinish, missingActualFinish, baselineFieldUsage: baselineUsage },
      } : undefined,
    };
  }
}
