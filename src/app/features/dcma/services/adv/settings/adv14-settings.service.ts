// src/app/dcma/services/adv/adv14-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck14Advanced } from '../types/adv14-settings.types';
import type { DcmaCheck14Options } from '../../../../../p6/services/dcma/src/check/check14.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv14SettingsService {
  private readonly adv14Key = 'dcma.adv.14';
  private readonly adv14Signal = signal<DcmaCheck14Advanced>(this.loadAdv14());

  /** Получить текущие Advanced-настройки (signal getter) */
  adv14(): DcmaCheck14Advanced { return this.adv14Signal(); }

  /** Инициализация дефолтов в SSR-safe стиле */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv14Key)) {
      const def = this.defaultAdv14();
      localStorage.setItem(this.adv14Key, JSON.stringify(def));
      this.adv14Signal.set(def);
    }
  }

  /** Сбросить настройки к дефолтным значениям */
  resetAdv14(): void {
    const def = this.defaultAdv14();
    this.adv14Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv14Key, JSON.stringify(def));
    }
  }

  /** Частичный патч Advanced-настроек с мёрджем вложенных структур */
  patchAdv14(patch: Partial<DcmaCheck14Advanced>) {
    const cur = this.adv14Signal();
    const next: DcmaCheck14Advanced = {
      ...cur,
      ...patch,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
      dataDateFieldOrder: Array.isArray(patch.dataDateFieldOrder)
        ? [...patch.dataDateFieldOrder]
        : cur.dataDateFieldOrder,
      baselineFinishFieldsOrder: Array.isArray(patch.baselineFinishFieldsOrder)
        ? [...patch.baselineFinishFieldsOrder]
        : cur.baselineFinishFieldsOrder,
    };
    this.adv14Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv14Key, JSON.stringify(next));
    }
  }

  /** Собрать опции для сервиса анализа Check 14 */
  buildCheck14Options(): DcmaCheck14Options {
    const a = this.adv14();
    return {
      dataDateOverrideISO: a.dataDateOverrideISO ?? undefined,
      dataDateFieldOrder: a.dataDateFieldOrder?.length ? a.dataDateFieldOrder : undefined,
      baselineFinishFieldsOrder: a.baselineFinishFieldsOrder?.length ? a.baselineFinishFieldsOrder : undefined,
      plannedComparisonMode: a.plannedComparisonMode,
      requireActualFinishForActuals: a.requireActualFinishForActuals,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
      includeDetails: a.includeDetails,
      requiredMinBei: a.thresholds.requiredMinBei,
    };
  }

  /** Визуальная оценка KPI (используется только для UI-градации) */
  evaluateCheck14Grade(bei: number | null | undefined): 'great' | 'average' | 'poor' {
    const { greatMinBei, averageMinBei } = this.adv14().thresholds;
    const v = typeof bei === 'number' && Number.isFinite(bei) ? bei : -Infinity;
    if (v >= greatMinBei) return 'great';
    if (v >= averageMinBei) return 'average';
    return 'poor';
  }

  /** Pass/Fail: BEI >= requiredMinBei */
  evaluateCheck14Pass(bei: number | null | undefined): boolean {
    const req = this.adv14().thresholds.requiredMinBei;
    const v = typeof bei === 'number' && Number.isFinite(bei) ? bei : -Infinity;
    return v >= req;
  }

  // ==== I/O ====
  private loadAdv14(): DcmaCheck14Advanced {
    if (typeof window === 'undefined') return this.defaultAdv14();
    const raw = localStorage.getItem(this.adv14Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...this.defaultAdv14(), ...parsed };
      } catch { /* ignore parse error -> fall back to defaults */ }
    }
    const def = this.defaultAdv14();
    localStorage.setItem(this.adv14Key, JSON.stringify(def));
    return def;
  }

  /** Дефолтные значения Advanced для BEI */
  private defaultAdv14(): DcmaCheck14Advanced {
    return {
      includeDetails: true,

      dataDateOverrideISO: null,
      dataDateFieldOrder: ['data_date', 'last_recalc_date', 'last_sched_date', 'cur_data_date'],
      baselineFinishFieldsOrder: [
        'bl1_finish_date', 'bl_finish_date', 'baseline_finish_date', 'target_end_date', 'target_finish_date'
      ],

      plannedComparisonMode: 'lte',
      requireActualFinishForActuals: false,

      // Фильтры eligible-набора
      ignoreWbsSummaryActivities: true,   // WBS Summary исключаем по умолчанию
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreCompletedActivities: false,

      // Пороги для Pass и KPI
      thresholds: {
        requiredMinBei: 0.95,  // DCMA целевой порог Pass
        averageMinBei: 0.95,   // KPI «Average»
        greatMinBei: 1.0       // KPI «Great»
      }
    };
  }
}