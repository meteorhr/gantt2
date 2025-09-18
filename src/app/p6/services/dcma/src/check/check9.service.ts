// src/app/p6/services/dcma/src/check/check9.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck9ActualItem, DcmaCheck9ForecastItem, DcmaCheck9Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, dayUTC } from '../utils/date.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck9Service {
  private readonly dexie = inject(P6DexieService);

  /** DCMA Check 9 — Invalid Dates: 9a (Forecast < DD), 9b (Actual > DD) */
  async analyzeCheck9(
    projId: number,
    includeDetails: boolean = true,
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

    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isCompleted = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    const toDay = (v: unknown): number | null => {
      const d = toDateStrict(v);
      return d ? dayUTC(d) : null;
    };

    // 9a: invalid forecast (для незавершённых)
    const forecastBad: DcmaCheck9ForecastItem[] = [];
    let tasksCheckedForecast = 0;
    let missingForecastFields = 0;

    for (const t of tasksInProject) {
      if (isCompleted(t.status_code)) continue;

      const esDay = toDay((t as any).early_start_date);
      const efDay = toDay((t as any).early_end_date);
      const lsDay = toDay((t as any).late_start_date);
      const lfDay = toDay((t as any).late_end_date);

      const hadAnyField = (t as any).early_start_date != null || (t as any).early_end_date != null || (t as any).late_start_date != null || (t as any).late_end_date != null;
      const allNull = esDay == null && efDay == null && lsDay == null && lfDay == null;

      if (hadAnyField && allNull) missingForecastFields++;
      if (!hadAnyField) continue;

      tasksCheckedForecast++;

      const anyInPast = (esDay != null && esDay < dataDay) || (efDay != null && efDay < dataDay) || (lsDay != null && lsDay < dataDay) || (lfDay != null && lfDay < dataDay);
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

    // 9b: invalid actual
    const actualBad: DcmaCheck9ActualItem[] = [];
    let tasksCheckedActual = 0;
    let missingActualFields = 0;

    for (const t of tasksInProject) {
      const asDay = toDay((t as any).act_start_date);
      const afDay = toDay((t as any).act_end_date);
      const hadAnyFact = (t as any).act_start_date != null || (t as any).act_end_date != null;
      const bothNull = asDay == null && afDay == null;
      if (hadAnyFact && bothNull) missingActualFields++;
      if (!hadAnyFact) continue;

      tasksCheckedActual++;

      const anyInFuture = (asDay != null && asDay > dataDay) || (afDay != null && afDay > dataDay);
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

    return {
      proj_id: projId,
      dataDateISO: new Date(dataDay).toISOString(),
      invalidForecastCount: forecastBad.length,
      invalidActualCount: actualBad.length,
      hasInvalidDates: forecastBad.length > 0 || actualBad.length > 0,
      details: includeDetails ? {
        forecast: forecastBad,
        actual: actualBad,
        dq: {
          tasksCheckedForecast,
          tasksCheckedActual,
          missingForecastFields,
          missingActualFields,
          parseErrors: 0,
        },
      } : undefined,
    };
  }
}
