// src/app/p6/services/dcma/src/check/check14.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck14Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, dayUTC } from '../utils/date.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck14Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 14 — Baseline Execution Index (BEI)
   * BEI = (фактически завершено к Data Date) / (по БП должно быть завершено к Data Date)
   */
  async analyzeCheck14(
    projId: number,
    includeDetails: boolean = true,
  ): Promise<DcmaCheck14Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // Data Date (PROJECT)
    const ddRaw = proj['data_date'] ?? proj['last_recalc_date'] ?? proj['last_sched_date'] ?? proj['cur_data_date'] ?? null;
    if (!ddRaw) throw new Error('Не найдена Data Date в PROJECT (ожидается data_date/last_recalc_date/last_sched_date/cur_data_date).');
    const dataDate = toDateStrict(ddRaw);
    if (!dataDate) throw new Error(`Невалидная Data Date: ${String(ddRaw)}`);
    const dataDay = dayUTC(dataDate);

    // Набор задач проекта
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Вспомогательные
    const isWbs = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    const BL_FIELDS: (keyof TaskRow | string)[] = [
      'bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'
    ];
    const getBaselineFinish = (t: TaskRow): Date | null => {
      for (const k of BL_FIELDS) {
        const d = toDateStrict((t as any)[k]);
        if (d) return d;
      }
      return null;
    };

    // Eligible: исключаем WBS Summary
    const eligible = tasksInProject.filter(t => !isWbs(t));

    // По БП должны быть завершены к DD: BL Finish <= DD (сравнение по дню UTC)
    const plannedSet: TaskRow[] = [];
    for (const t of eligible) {
      const blf = getBaselineFinish(t);
      if (blf && dayUTC(blf) <= dataDay) plannedSet.push(t);
    }

    // Фактически завершены к DD: AF <= DD (UTC-день) ИЛИ статус Completed при отсутствии AF
    const actuallySet: TaskRow[] = [];
    for (const t of eligible) {
      const af = toDateStrict(t.act_end_date);
      if (af) {
        if (dayUTC(af) <= dataDay) actuallySet.push(t);
      } else if (isCompleted(t.status_code)) {
        actuallySet.push(t);
      }
    }

    const plannedToComplete = plannedSet.length;
    const actuallyCompleted = actuallySet.length;

    let bei: number | null = null;
    let within: boolean | null = null;
    if (plannedToComplete > 0) {
      bei = Math.round(((actuallyCompleted / plannedToComplete) * 10000)) / 10000; // 4 знака
      within = bei >= 0.95; // ниже 0.95 — провал
    }

    const details = includeDetails ? {
      plannedButNotCompleted: plannedSet
        .filter(t => !actuallySet.includes(t))
        .map(t => ({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          baseline_finish: (t as any).bl1_finish_date ?? (t as any).bl_finish_date ?? (t as any).baseline_finish_date ?? (t as any).target_end_date ?? (t as any).target_finish_date ?? null,
        })),
      completedAheadOfPlan: actuallySet
        .filter(t => {
          const blf = getBaselineFinish(t);
          const af = toDateStrict(t.act_end_date);
          return !!af && blf !== null && dayUTC(af) <= dataDay && dayUTC(blf) > dataDay;
        })
        .map(t => ({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          act_finish: t.act_end_date,
          baseline_finish: (t as any).bl1_finish_date ?? (t as any).bl_finish_date ?? (t as any).baseline_finish_date ?? (t as any).target_end_date ?? (t as any).target_finish_date ?? null,
        })),
    } : undefined;

    return {
      proj_id: projId,
      dataDateISO: dataDate.toISOString(),
      plannedToComplete,
      actuallyCompleted,
      bei,
      beiWithin95pct: within,
      details,
    };
  }
}
