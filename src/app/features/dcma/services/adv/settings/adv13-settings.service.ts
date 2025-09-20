// src/app/dcma/services/adv/adv13-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck13Advanced } from '../types/adv13-settings.types';
import type { DcmaCheck13Options } from '../../../../../p6/services/dcma/src/check/check13.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv13SettingsService {
  private readonly adv13Key = 'dcma.adv.13';
  private readonly adv13Signal = signal<DcmaCheck13Advanced>(this.loadAdv13());

  /** Текущие Advanced-настройки (signal getter) */
  adv13(): DcmaCheck13Advanced { return this.adv13Signal(); }

  /** Инициализировать дефолты в SSR-safe стиле */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv13Key)) {
      const def = this.defaultAdv13();
      localStorage.setItem(this.adv13Key, JSON.stringify(def));
      this.adv13Signal.set(def);
    }
  }

  /** Сброс к дефолтам */
  resetAdv13(): void {
    const def = this.defaultAdv13();
    this.adv13Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv13Key, JSON.stringify(def));
    }
  }

  /** Частичный патч с мёрджем вложенных структур */
  patchAdv13(patch: Partial<DcmaCheck13Advanced>): void {
    const cur = this.adv13Signal();
    const next: DcmaCheck13Advanced = {
      ...cur,
      ...patch,
      thresholds: patch.thresholds ? { ...cur.thresholds, ...patch.thresholds } : cur.thresholds,
      dataDateFieldOrder: Array.isArray(patch.dataDateFieldOrder)
        ? [...patch.dataDateFieldOrder]
        : cur.dataDateFieldOrder,
      baselineFinishFieldsOrder: Array.isArray(patch.baselineFinishFieldsOrder)
        ? [...patch.baselineFinishFieldsOrder]
        : cur.baselineFinishFieldsOrder,
    };
    this.adv13Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv13Key, JSON.stringify(next));
    }
  }

  /** Собрать опции для сервиса анализа Check 13 */
  buildCheck13Options(): DcmaCheck13Options {
    const a = this.adv13();
    return {
      includeDetails: a.includeDetails,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
      baselineFields: a.baselineFinishFieldsOrder?.length ? a.baselineFinishFieldsOrder : undefined,
      forecastSource: a.forecastSource,
      dataDateOverride: a.dataDateOverrideISO ?? undefined,
      dataDateFields: a.dataDateFieldOrder?.length ? a.dataDateFieldOrder : undefined,
      cpliTolerancePct: a.thresholds.requiredTolerancePct,
      clampNegativeCpl: a.clampNegativeCpl,
    };
  }

  /** KPI-градация: чем ближе к 1.0, тем лучше */
  evaluateCheck13Grade(cpli: number | null | undefined): 'great' | 'average' | 'poor' {
    const { greatTolerancePct, averageTolerancePct } = this.adv13().thresholds;
    const v = typeof cpli === 'number' && Number.isFinite(cpli) ? cpli : Number.NaN;
    if (!Number.isFinite(v)) return 'poor';
    const devPct = Math.abs(v - 1) * 100;
    if (devPct <= greatTolerancePct) return 'great';
    if (devPct <= averageTolerancePct) return 'average';
    return 'poor';
  }

  /** Pass/Fail: |CPLI - 1| ≤ requiredTolerancePct% */
  evaluateCheck13Pass(cpli: number | null | undefined): boolean {
    const tol = this.adv13().thresholds.requiredTolerancePct;
    const v = typeof cpli === 'number' && Number.isFinite(cpli) ? cpli : Number.NaN;
    if (!Number.isFinite(v)) return false;
    return Math.abs(v - 1) * 100 <= Math.max(0, tol);
  }

  // ==== I/O ====
  private loadAdv13(): DcmaCheck13Advanced {
    if (typeof window === 'undefined') return this.defaultAdv13();
    const raw = localStorage.getItem(this.adv13Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...this.defaultAdv13(), ...parsed };
      } catch { /* ignore parse error -> fall back to defaults */ }
    }
    const def = this.defaultAdv13();
    localStorage.setItem(this.adv13Key, JSON.stringify(def));
    return def;
  }

  /** Дефолты для Check 13 (совместимы с текущей логикой сервиса) */
  private defaultAdv13(): DcmaCheck13Advanced {
    return {
      includeDetails: true,

      forecastSource: 'EF_LF_AF',

      dataDateOverrideISO: null,
      dataDateFieldOrder: ['data_date', 'last_recalc_date', 'last_sched_date', 'cur_data_date'],

      baselineFinishFieldsOrder: [
        'bl1_finish_date',
        'bl_finish_date',
        'baseline_finish_date',
        'target_end_date',
        'target_finish_date'
      ],

      clampNegativeCpl: true,

      // По умолчанию фильтры выключены, чтобы не менять существующее поведение
      ignoreWbsSummaryActivities: false,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreCompletedActivities: false,

      thresholds: {
        requiredTolerancePct: 5, // Pass: ±5%
        averageTolerancePct: 5,  // KPI Average: ±5%
        greatTolerancePct: 2     // KPI Great:  ±2%
      }
    };
  }
}