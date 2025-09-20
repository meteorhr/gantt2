// src/app/p6/services/dcma/src/check/check9.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck9ActualItem, DcmaCheck9ForecastItem, DcmaCheck9Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, dayUTC } from '../utils/date.util';

/**
 * Дополнительные опции для Check 9.
 * - forecastToleranceDays: допуск по дням для 9a (Forecast < DD - tol)
 * - actualToleranceDays:   допуск по дням для 9b (Actual   > DD + tol)
 * - фильтры по активностям
 */
export type DcmaCheck9Options = {
  includeDetails: boolean;
  detailsLimit: number;

  /** 9a: Forecast считается некорректным, если дата < (DD - forecastToleranceDays). По умолчанию 0. */
  forecastToleranceDays: number;
  /** 9b: Actual считается некорректным, если дата > (DD + actualToleranceDays). По умолчанию 0. */
  actualToleranceDays: number;

  /** Фильтры уровня активностей (применяются до проверок 9a/9b) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;        // LOE/Hammock/SUMMARY
  ignoreWbsSummaryActivities: boolean; // TT_WBS
  ignoreCompletedActivities: boolean;  // глобально исключать Completed из обеих проверок
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck9Service {
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

  /** DCMA Check 9 — Invalid Dates: 9a (Forecast < DD), 9b (Actual > DD) */
  async analyzeCheck9(
    projId: number,
    includeDetails: boolean = true,
    options?: Partial<DcmaCheck9Options>
  ): Promise<DcmaCheck9Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    const dataDate = toDateStrict(
      proj['data_date'] ?? proj['last_recalc_date'] ?? proj['last_sched_date'] ?? proj['cur_data_date'] ?? null
    );
    if (!dataDate) throw new Error('Не найдена корректная Data Date (PROJECT).');
    const dataDay = dayUTC(dataDate);

    // Нормализация опций (дефолты) + совместимость includeDetails
    const opts: DcmaCheck9Options = {
      includeDetails,
      detailsLimit: 500,
      forecastToleranceDays: 0,
      actualToleranceDays: 0,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      ...(options ?? {}),
    };

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Базовая предфильтрация активностей
    const eligible: TaskRow[] = [];
    for (const t of tasksInProject) {
      if (opts.ignoreWbsSummaryActivities && this.isWbs(t)) continue;
      if (opts.ignoreMilestoneActivities && this.isMilestone(t)) continue;
      if (opts.ignoreLoEActivities && this.isLoEOrHammock(t)) continue;
      if (opts.ignoreCompletedActivities && this.isCompleted(t.status_code)) continue;
      eligible.push(t);
    }

    const toDay = (v: unknown): number | null => {
      const d = toDateStrict(v);
      return d ? dayUTC(d) : null;
    };

    // 9a: invalid forecast (для незавершённых по DCMA, плюс применены глобальные фильтры)
    const forecastBad: DcmaCheck9ForecastItem[] = [];
    let tasksCheckedForecast = 0;
    let missingForecastFields = 0;
    const forecastThreshold = dataDay - Math.max(0, Math.floor(opts.forecastToleranceDays));

    for (const t of eligible) {
      if (this.isCompleted(t.status_code)) continue; // классическое требование 9a

      const esDay = toDay((t as any).early_start_date);
      const efDay = toDay((t as any).early_end_date);
      const lsDay = toDay((t as any).late_start_date);
      const lfDay = toDay((t as any).late_end_date);

      const hadAnyField = (t as any).early_start_date != null || (t as any).early_end_date != null || (t as any).late_start_date != null || (t as any).late_end_date != null;
      const allNull = esDay == null && efDay == null && lsDay == null && lfDay == null;

      if (hadAnyField && allNull) missingForecastFields++;
      if (!hadAnyField) continue;

      tasksCheckedForecast++;

      const anyInPast = (esDay != null && esDay < forecastThreshold)
                     || (efDay != null && efDay < forecastThreshold)
                     || (lsDay != null && lsDay < forecastThreshold)
                     || (lfDay != null && lfDay < forecastThreshold);
      if (anyInPast) {
        forecastBad.push({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          early_start_date: (t as any).early_start_date,
          early_end_date: (t as any).early_end_date,
          late_start_date: (t as any).late_start_date,
          late_end_date: (t as any).late_end_date,
        });
      }
    }

    // 9b: invalid actual (для всех, к кому применимы фильтры; допускаем tol на будущее)
    const actualBad: DcmaCheck9ActualItem[] = [];
    let tasksCheckedActual = 0;
    let missingActualFields = 0;
    const actualThreshold = dataDay + Math.max(0, Math.floor(opts.actualToleranceDays));

    for (const t of eligible) {
      const asDay = toDay((t as any).act_start_date);
      const afDay = toDay((t as any).act_end_date);
      const hadAnyFact = (t as any).act_start_date != null || (t as any).act_end_date != null;
      const bothNull = asDay == null && afDay == null;
      if (hadAnyFact && bothNull) missingActualFields++;
      if (!hadAnyFact) continue;

      tasksCheckedActual++;

      const anyInFuture = (asDay != null && asDay > actualThreshold) || (afDay != null && afDay > actualThreshold);
      if (anyInFuture) {
        actualBad.push({
          task_id: t.task_id,
          task_code: t.task_code,
          task_name: t.task_name,
          act_start_date: (t as any).act_start_date,
          act_end_date: (t as any).act_end_date,
        });
      }
    }

    // Ограничиваем детали лимитом
    const details = opts.includeDetails ? {
      forecast: forecastBad.slice(0, Math.max(0, opts.detailsLimit | 0)),
      actual: actualBad.slice(0, Math.max(0, opts.detailsLimit | 0)),
      dq: {
        tasksCheckedForecast,
        tasksCheckedActual,
        missingForecastFields,
        missingActualFields,
        parseErrors: 0,
      },
    } : undefined;

    return {
      proj_id: projId,
      dataDateISO: new Date(dataDay).toISOString(),
      invalidForecastCount: forecastBad.length,
      invalidActualCount: actualBad.length,
      hasInvalidDates: forecastBad.length > 0 || actualBad.length > 0,
      details,
    };
  }
}
