// src/app/p6/services/dcma/src/check/check13.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck13Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, daysDiffUTC } from '../utils/date.util';

@Injectable({ providedIn: 'root' })
export class DcmaCheck13Service {
  private readonly dexie = inject(P6DexieService);

  /**
   * DCMA Check 13 — Critical Path Length Index (CPLI)
   */
  async analyzeCheck13(
    projId: number,
    options?: { hoursPerDay?: number },
  ): Promise<DcmaCheck13Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // Data Date (обязательна)
    const ddRaw = proj['data_date'] ?? proj['last_recalc_date'] ?? proj['last_sched_date'] ?? proj['cur_data_date'] ?? null;
    if (!ddRaw) throw new Error('Не найдена Data Date в PROJECT (ожидается data_date/last_recalc_date/last_sched_date/cur_data_date).');
    const dataDate = toDateStrict(ddRaw);
    if (!dataDate) throw new Error(`Невалидная Data Date: ${String(ddRaw)}`);

    // Фильтруем задачи проекта
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Вычисление прогнозного и базового финиша проекта (устойчиво)
    const resolveProjectDates = (tasks: TaskRow[]) => {
      let forecastFinish: Date | null = null;
      for (const t of tasks) {
        const ef = toDateStrict((t as any).early_end_date);
        const lf = toDateStrict((t as any).late_end_date);
        const af = toDateStrict((t as any).act_end_date);
        const candidate = ef || lf || af || null;
        if (candidate && (!forecastFinish || candidate > forecastFinish)) forecastFinish = candidate;
      }

      const BL_FIELDS = ['bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'];
      let baselineFinish: Date | null = null;
      for (const t of tasks) {
        for (const k of BL_FIELDS) {
          const d = toDateStrict((t as any)[k]);
          if (d && (!baselineFinish || d > baselineFinish)) baselineFinish = d;
        }
      }

      // Fallback: если baseline отсутствует — приравняем к прогнозу (PTF = 0)
      if (!baselineFinish && forecastFinish) baselineFinish = forecastFinish;

      return { forecastFinish, baselineFinish };
    };

    const { forecastFinish, baselineFinish } = resolveProjectDates(tasksInProject);
    const base: DcmaCheck13Result = { proj_id: projId } as DcmaCheck13Result;

    if (!forecastFinish) {
      return {
        ...base,
        dataDateISO: dataDate.toISOString(),
        forecastFinishISO: undefined,
        baselineFinishISO: baselineFinish?.toISOString() ?? null,
        criticalPathLengthDays: null,
        projectTotalFloatDays: null,
        cpli: null,
        cpliWithin5pct: null,
      };
    }

    // CPL — Forecast − DataDate (календарные дни)
    const CPL = Math.max(0, Math.round(daysDiffUTC(forecastFinish, dataDate) * 100) / 100);

    if (!baselineFinish) {
      return {
        ...base,
        dataDateISO: dataDate.toISOString(),
        forecastFinishISO: forecastFinish.toISOString(),
        baselineFinishISO: null,
        criticalPathLengthDays: CPL,
        projectTotalFloatDays: null,
        cpli: null,
        cpliWithin5pct: null,
      };
    }

    // PTF — Baseline − Forecast (может быть отрицательным)
    const PTF = Math.round(daysDiffUTC(baselineFinish, forecastFinish) * 100) / 100;

    if (CPL <= 0) {
      return {
        ...base,
        dataDateISO: dataDate.toISOString(),
        forecastFinishISO: forecastFinish.toISOString(),
        baselineFinishISO: baselineFinish.toISOString(),
        criticalPathLengthDays: CPL,
        projectTotalFloatDays: PTF,
        cpli: null,
        cpliWithin5pct: null,
      };
    }

    const cpli = Math.round((((CPL + PTF) / CPL) * 10000)) / 10000;
    const cpliWithin5pct = (cpli >= 0.95 && cpli <= 1.05);

    return {
      ...base,
      dataDateISO: dataDate.toISOString(),
      forecastFinishISO: forecastFinish.toISOString(),
      baselineFinishISO: baselineFinish.toISOString(),
      criticalPathLengthDays: CPL,
      projectTotalFloatDays: PTF,
      cpli,
      cpliWithin5pct,
    };
  }
}