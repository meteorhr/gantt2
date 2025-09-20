// src/app/dcma/services/adv/adv11-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck11Advanced } from '../types/adv11-settings.types';
import type { DcmaCheck11Options } from '../../../../../p6/services/dcma/src/check/check11.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv11SettingsService {
  private readonly adv11Key = 'dcma.adv.11';
  private readonly adv11Signal = signal<DcmaCheck11Advanced>(this.loadAdv11());

  /** Текущие Advanced-настройки */
  adv11(): DcmaCheck11Advanced { return this.adv11Signal(); }

  /** SSR-safe инициализация дефолтов в localStorage (вызвать при открытии настроек/вкладки) */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv11Key)) {
      const def = this.defaultAdv11();
      localStorage.setItem(this.adv11Key, JSON.stringify(def));
      this.adv11Signal.set(def);
    }
  }

  /** Сброс только настроек Check 11 к дефолтам */
  resetAdv11(): void {
    const def = this.defaultAdv11();
    this.adv11Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv11Key, JSON.stringify(def));
    }
  }

  /** Частичный патч с аккуратным мёрджем и нормализацией порогов */
  patchAdv11(patch: Partial<DcmaCheck11Advanced>): void {
    const cur = this.adv11Signal();

    // нормализация процентов (0..100 с шагом 0.1)
    const clampPct = (v: unknown): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      const bounded = Math.min(Math.max(n, 0), 100);
      return Math.round(bounded * 10) / 10;
    };

    // подготовим новые thresholds (если прилетели)
    let th = cur.thresholds;
    if (patch.thresholds) {
      const raw = { ...th, ...patch.thresholds };
      // enforce: great ≤ average ≤ required
      const required = clampPct(raw.requiredMaxPct);
      const average  = Math.min(clampPct(raw.averageMaxPct), required);
      const great    = Math.min(clampPct(raw.greatMaxPct), average);
      th = { requiredMaxPct: required, averageMaxPct: average, greatMaxPct: great };
    }

    const next: DcmaCheck11Advanced = {
      ...cur,
      ...patch,
      thresholds: th,
      detailsLimit: this.clampInt(patch.detailsLimit ?? cur.detailsLimit, 0, 1_000_000),
      includeDetails: (patch.includeDetails ?? cur.includeDetails) as boolean,
      ignoreMilestoneActivities: (patch.ignoreMilestoneActivities ?? cur.ignoreMilestoneActivities) as boolean,
      ignoreLoEActivities: (patch.ignoreLoEActivities ?? cur.ignoreLoEActivities) as boolean,
      ignoreWbsSummaryActivities: (patch.ignoreWbsSummaryActivities ?? cur.ignoreWbsSummaryActivities) as boolean,
      ignoreCompletedActivities: (patch.ignoreCompletedActivities ?? cur.ignoreCompletedActivities) as boolean,
    };

    this.adv11Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv11Key, JSON.stringify(next));
    }
  }

  /** Собрать опции для сервиса анализа Check 11 */
  buildCheck11Options(): DcmaCheck11Options {
    const a = this.adv11();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      requiredMaxPct: a.thresholds.requiredMaxPct,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  /** Визуальная оценка KPI (для таблицы/бейджей) */
  evaluateCheck11Grade(missedPercent: number): 'great' | 'average' | 'poor' {
    const { greatMaxPct, averageMaxPct } = this.adv11().thresholds;
    if (missedPercent <= greatMaxPct) return 'great';
    if (missedPercent <= averageMaxPct) return 'average';
    return 'poor';
  }

  /** Pass/Fail: DCMA требование — не выше requiredMaxPct */
  evaluateCheck11Pass(missedPercent: number): boolean {
    return missedPercent <= this.adv11().thresholds.requiredMaxPct;
  }

  // ===== I/O =====

  private loadAdv11(): DcmaCheck11Advanced {
    if (typeof window === 'undefined') return this.defaultAdv11();
    const raw = localStorage.getItem(this.adv11Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // поверх дефолтов (на случай добавления полей в будущем)
        const merged: DcmaCheck11Advanced = { ...this.defaultAdv11(), ...parsed };
        // финальная нормализация порогов
        return this.normalizeThresholds(merged);
      } catch { /* ignore parse errors */ }
    }
    const def = this.defaultAdv11();
    localStorage.setItem(this.adv11Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv11(): DcmaCheck11Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,

      // Фильтры по умолчанию выключены, чтобы не менять историческое поведение
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,

      // DCMA Pass ≤ 5%; KPI по умолчанию: Great ≤ 2%, Average ≤ 5%
      thresholds: { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 2.0 },
    };
  }

  // ===== utils =====

  private clampInt(v: unknown, min: number, max: number): number {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  private normalizeThresholds(a: DcmaCheck11Advanced): DcmaCheck11Advanced {
    const clampPct = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      const bounded = Math.min(Math.max(n, 0), 100);
      return Math.round(bounded * 10) / 10;
    };
    const required = clampPct(a.thresholds.requiredMaxPct);
    const average  = Math.min(clampPct(a.thresholds.averageMaxPct), required);
    const great    = Math.min(clampPct(a.thresholds.greatMaxPct), average);
    return { ...a, thresholds: { requiredMaxPct: required, averageMaxPct: average, greatMaxPct: great } };
  }
}