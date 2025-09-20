// src/app/p6/services/dcma/src/check/check14.service.ts
import { Injectable, inject } from '@angular/core';
import { P6DexieService } from '../../../../dexie.service';
import { DcmaCheck14Result, TaskRow } from '../../models/dcma.model';
import { toDateStrict, dayUTC } from '../utils/date.util';

/**
 * Дополнительные опции расчёта для DCMA Check 14 (BEI).
 *
 * Эти опции не ломают обратную совместимость: если не заданы —
 * поведение совпадает с существующим.
 */
export interface DcmaCheck14Options {
  /** Переопределить Data Date (ISO). Если валидно — используется вместо полей из PROJECT. */
  dataDateOverrideISO?: string | null;
  /** Приоритет полей PROJECT для извлечения Data Date. */
  dataDateFieldOrder?: string[]; // по умолчанию ['data_date','last_recalc_date','last_sched_date','cur_data_date']

  /** Порядок предпочтения полей Baseline Finish на уровне задач. */
  baselineFinishFieldsOrder?: (keyof TaskRow | string)[]; // по умолчанию как было

  /** Сравнение BL Finish с DD: 'lte' (<=, по умолчанию) или 'lt' (<). */
  plannedComparisonMode?: 'lte' | 'lt';

  /** Требовать наличия Actual Finish для зачёта «фактически завершено». */
  requireActualFinishForActuals?: boolean; // по умолчанию false (разрешаем статус Completed как фолбэк)

  /** Фильтры eligible-набора. По умолчанию WBS исключаем (true), остальные — не исключаем. */
  ignoreWbsSummaryActivities?: boolean; // default true (совместимо с прежним поведением)
  ignoreMilestoneActivities?: boolean;  // default false
  ignoreLoEActivities?: boolean;        // default false
  ignoreCompletedActivities?: boolean;  // default false

  /** Включать подробные списки (перекрывает позиционный includeDetails). */
  includeDetails?: boolean;

  /** Порог для Pass: BEI ≥ requiredMinBei ⇒ Pass (UI может дополнительно оценивать KPI). */
  requiredMinBei?: number; // default 0.95
}

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
    options?: DcmaCheck14Options,
  ): Promise<DcmaCheck14Result> {
    const [taskRows, projRowsRaw] = await Promise.all([
      this.dexie.getRows('TASK') as Promise<TaskRow[]>,
      this.dexie.getRows('PROJECT') as Promise<Array<Record<string, any>>>,
    ]);

    const proj = (projRowsRaw || []).find(p => p['proj_id'] === projId);
    if (!proj) throw new Error(`Проект с proj_id=${projId} не найден в PROJECT.`);

    // ==== Опции и дефолты ====
    const opt: Required<Omit<DcmaCheck14Options,
      'dataDateOverrideISO' | 'baselineFinishFieldsOrder' | 'dataDateFieldOrder' | 'includeDetails' | 'requiredMinBei'>> & {
        dataDateOverrideISO?: string | null;
        baselineFinishFieldsOrder?: (keyof TaskRow | string)[];
        dataDateFieldOrder?: string[];
        includeDetails?: boolean;
        requiredMinBei?: number;
      } = {
      plannedComparisonMode: 'lte',
      requireActualFinishForActuals: false,
      ignoreWbsSummaryActivities: true,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreCompletedActivities: false,
      dataDateOverrideISO: options?.dataDateOverrideISO,
      dataDateFieldOrder: options?.dataDateFieldOrder,
      baselineFinishFieldsOrder: options?.baselineFinishFieldsOrder,
      includeDetails: options?.includeDetails,
      requiredMinBei: options?.requiredMinBei,
    };

    const includeDetailsEff = (opt.includeDetails ?? includeDetails) === true;

    // ==== Data Date ====
    const defaultDDOrder = ['data_date','last_recalc_date','last_sched_date','cur_data_date'];
    const ddOrder = Array.isArray(opt.dataDateFieldOrder) && opt.dataDateFieldOrder.length > 0
      ? opt.dataDateFieldOrder
      : defaultDDOrder;

    let dataDate: Date | null = null;
    if (opt.dataDateOverrideISO) {
      dataDate = toDateStrict(opt.dataDateOverrideISO);
    }
    if (!dataDate) {
      for (const k of ddOrder) {
        const v = proj[k];
        const d = toDateStrict(v);
        if (d) { dataDate = d; break; }
      }
    }
    if (!dataDate) throw new Error('Не найдена Data Date в PROJECT (или неверный override).');
    const dataDay = dayUTC(dataDate);

    // ==== Набор задач проекта и фильтры ====
    const tasksInProject = (taskRows || []).filter(t => t.proj_id === projId);

    const isWbs   = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_WBS');
    const isMile  = (t: TaskRow) => { const tp = (t.task_type ?? '').trim(); return tp === 'TT_Mile' || tp === 'TT_StartMile' || tp === 'TT_FinMile'; };
    const isLoE   = (t: TaskRow) => ((t.task_type ?? '').trim() === 'TT_LOE');
    const isCompl = (v: unknown): boolean => {
      const s = (typeof v === 'string' ? v : String(v ?? '')).trim().toUpperCase();
      return s === 'COMPLETED' || s === 'TK_COMPLETE' || s === 'FINISHED';
    };

    const eligible: TaskRow[] = [];
    for (const t of tasksInProject) {
      if (opt.ignoreWbsSummaryActivities && isWbs(t)) continue;
      if (opt.ignoreMilestoneActivities && isMile(t)) continue;
      if (opt.ignoreLoEActivities && isLoE(t)) continue;
      if (opt.ignoreCompletedActivities && isCompl(t.status_code)) continue;
      eligible.push(t);
    }

    // ==== Baseline Finish preference ====
    const BL_FIELDS: (keyof TaskRow | string)[] = opt.baselineFinishFieldsOrder ?? [
      'bl1_finish_date','bl_finish_date','baseline_finish_date','target_end_date','target_finish_date'
    ];
    const getBaselineFinish = (t: TaskRow): Date | null => {
      for (const k of BL_FIELDS) {
        const d = toDateStrict((t as any)[k]);
        if (d) return d;
      }
      return null;
    };

    // ==== Planned to complete by DD ====
    const cmpLte = opt.plannedComparisonMode !== 'lt'; // true => <=, false => <
    const plannedSet: TaskRow[] = [];
    for (const t of eligible) {
      const blf = getBaselineFinish(t);
      if (!blf) continue;
      const ddiff = dayUTC(blf) - dataDay;
      if ((cmpLte && ddiff <= 0) || (!cmpLte && ddiff < 0)) plannedSet.push(t);
    }

    // ==== Actually completed by DD ====
    const actuallySet: TaskRow[] = [];
    for (const t of eligible) {
      const af = toDateStrict(t.act_end_date);
      if (af) {
        if (dayUTC(af) <= dataDay) actuallySet.push(t);
      } else if (!opt.requireActualFinishForActuals && isCompl(t.status_code)) {
        // фолбэк по статусу, если AF отсутствует
        actuallySet.push(t);
      }
    }

    const plannedToComplete = plannedSet.length;
    const actuallyCompleted = actuallySet.length;

    let bei: number | null = null;
    let within: boolean | null = null;
    if (plannedToComplete > 0) {
      bei = Math.round(((actuallyCompleted / plannedToComplete) * 10000)) / 10000; // 4 знака
      const passMin = typeof opt.requiredMinBei === 'number' && Number.isFinite(opt.requiredMinBei)
        ? opt.requiredMinBei!
        : 0.95;
      within = bei >= passMin; // порог может быть переопределён опцией
    }

    const details = includeDetailsEff ? {
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
      beiWithin95pct: within, // теперь основано на requiredMinBei (по умолчанию 0.95)
      details,
    };
  }
}
