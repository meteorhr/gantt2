// src/app/p6/services/dcma/src/check/check13.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck13Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, daysDiffUTC } from '../utils/date.util';

/**
 * Дополнительные опции анализа для DCMA Check 13 (CPLI).
 * Все поля опциональны и имеют дефолты, сохраняя совместимость с текущими вызовами.
 * Часы в дне берём из календарей задач/проекта при необходимости; отдельная опция hoursPerDay не требуется.
 */
export type DcmaCheck13Options = {
  /** Включать служебные детали в дальнейшие версии (результат не расширяем здесь, чтобы не ломать контракт) */
  includeDetails?: boolean;

  /** Фильтры уровня активностей */
  ignoreMilestoneActivities?: boolean;
  ignoreLoEActivities?: boolean;
  ignoreWbsSummaryActivities?: boolean;
  ignoreCompletedActivities?: boolean;

  /**
   * Приоритет полей базового плана (по убыванию приоритета). Если не задано — используется стандартный перечень.
   */
  baselineFields?: string[];

  /**
   * Источник прогнозного финиша задачи:
   *  - 'EF_LF_AF' (по умолчанию): early_finish → late_finish → actual_finish (как раньше)
   *  - 'EF' | 'LF' | 'AF' — использовать только одно поле
   */
  forecastSource?: 'EF_LF_AF' | 'EF' | 'LF' | 'AF';

  /** Переопределение Data Date непосредственным значением */
  dataDateOverride?: string | Date;
  /** Альтернативный список полей PROJECT для поиска Data Date */
  dataDateFields?: string[];

  /** Допуск для заключения «в пределах 5%»; по умолчанию 5 (%). */
  cpliTolerancePct?: number;
  /** Если true (по умолчанию) — CPL < 0 округляется к 0. */
  clampNegativeCpl?: boolean;
};

@Injectable({ providedIn: 'root' })
export class DcmaCheck13Service {
  private readonly dexie = inject(P6DexieService);

  private round2(n: number): number { return Math.round(n * 100) / 100; }

  // Нормализация типов задач
  private normType(t: TaskRow): string { return String(t.task_type ?? '').trim().toUpperCase(); }
  private isWbs(t: TaskRow): boolean { return this.normType(t) === 'TT_WBS'; }
  private isMilestone(t: TaskRow): boolean {
    const ty = this.normType(t);
    return ty === 'TT_MILE' || ty === 'TT_STARTMILE' || ty === 'TT_FINMILE';
  }
  private isLoEOrHammock(t: TaskRow): boolean {
    const ty = this.normType(t);
    return ty === 'TT_LOE' || ty === 'TT_HAMMOCK' || ty === 'TT_SUMMARY';
  }
  private isCompleted(t: TaskRow): boolean {
    const s = String(t.status_code ?? '').trim().toUpperCase();
    return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
  }

  /**
   * DCMA Check 13 — Critical Path Length Index (CPLI)
   */
  async analyzeCheck13(
    projId: number,
    options?: DcmaCheck13Options,
  ): Promise<DcmaCheck13Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // ==== Data Date (обязательна) ====
    const ddFieldsDefault = ['data_date','last_recalc_date','last_sched_date','cur_data_date'];
    const ddFields = options?.dataDateFields && options.dataDateFields.length > 0 ? options.dataDateFields : ddFieldsDefault;

    const ddRaw = options?.dataDateOverride ?? ddFields.map(k => proj[k]).find(v => v != null);
    if (!ddRaw) throw new Error('Не найдена Data Date в PROJECT (ожидается один из полей: ' + ddFields.join(', ') + ').');
    const dataDate = toDateStrict(ddRaw);
    if (!dataDate) throw new Error(`Невалидная Data Date: ${String(ddRaw)}`);

    // ==== Базовая выборка задач проекта ====
    let tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    // Пользовательские фильтры (по умолчанию выключены → поведение как раньше)
    if (options?.ignoreWbsSummaryActivities) tasksInProject = tasksInProject.filter(t => !this.isWbs(t));
    if (options?.ignoreMilestoneActivities) tasksInProject = tasksInProject.filter(t => !this.isMilestone(t));
    if (options?.ignoreLoEActivities) tasksInProject = tasksInProject.filter(t => !this.isLoEOrHammock(t));
    if (options?.ignoreCompletedActivities) tasksInProject = tasksInProject.filter(t => !this.isCompleted(t));

    // ==== Стратегия прогнозного финиша ====
    const fs = options?.forecastSource ?? 'EF_LF_AF';
    const pickForecastDate = (t: TaskRow): Date | null => {
      const ef = toDateStrict((t as any).early_end_date);
      const lf = toDateStrict((t as any).late_end_date);
      const af = toDateStrict((t as any).act_end_date);
      switch (fs) {
        case 'EF': return ef || null;
        case 'LF': return lf || null;
        case 'AF': return af || null;
        case 'EF_LF_AF': default: return ef || lf || af || null;
      }
    };

    // ==== Вычисление прогнозного и базового финиша проекта ====
    let forecastFinish: Date | null = null;
    for (const t of tasksInProject) {
      const d = pickForecastDate(t);
      if (d && (!forecastFinish || d > forecastFinish)) forecastFinish = d;
    }

    const BL_FIELDS_DEFAULT = ['bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'];
    const BL_FIELDS = options?.baselineFields && options.baselineFields.length > 0 ? options.baselineFields : BL_FIELDS_DEFAULT;

    let baselineFinish: Date | null = null;
    for (const t of tasksInProject) {
      for (const k of BL_FIELDS) {
        const d = toDateStrict((t as any)[k]);
        if (d && (!baselineFinish || d > baselineFinish)) baselineFinish = d;
      }
    }

    // Fallback: если baseline отсутствует — приравняем к прогнозу (PTF = 0)
    if (!baselineFinish && forecastFinish) baselineFinish = forecastFinish;

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

    const clamp = options?.clampNegativeCpl !== false; // default: true
    const CPLraw = daysDiffUTC(forecastFinish, dataDate);
    const CPL = this.round2(clamp ? Math.max(0, CPLraw) : CPLraw);

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

    const PTF = this.round2(daysDiffUTC(baselineFinish, forecastFinish));

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
    const tol = Math.max(0, options?.cpliTolerancePct ?? 5); // %
    const minOk = 1 - tol / 100;
    const maxOk = 1 + tol / 100;
    const cpliWithin5pct = (cpli >= minOk && cpli <= maxOk);

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