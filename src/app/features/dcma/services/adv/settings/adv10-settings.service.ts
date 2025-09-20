// src/app/dcma/services/adv/adv10-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck10Advanced } from '../types/adv10-settings.types';
import type { DcmaCheck10Options } from '../../../../../p6/services/dcma/src/check/check10.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv10SettingsService {
  private readonly adv10Key = 'dcma.adv.10';
  private readonly adv10Signal = signal<DcmaCheck10Advanced>(this.loadAdv10());

  /** Текущие Advanced-настройки */
  adv10(): DcmaCheck10Advanced { return this.adv10Signal(); }

  /** SSR-safe инициализация дефолтов в localStorage */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv10Key)) {
      const def = this.defaultAdv10();
      localStorage.setItem(this.adv10Key, JSON.stringify(def));
      this.adv10Signal.set(def);
    }
  }

  /** Сброс только настроек Check 10 к дефолтам */
  resetAdv10(): void {
    const def = this.defaultAdv10();
    this.adv10Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv10Key, JSON.stringify(def));
    }
  }

  /** Частичный патч с нормализацией полей и мёрджем thresholds */
  patchAdv10(patch: Partial<DcmaCheck10Advanced>): void {
    const cur = this.adv10Signal();

    // нормализация %
    const clampPct = (v: unknown): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      const bounded = Math.min(Math.max(n, 0), 100);
      return Math.round(bounded * 10) / 10; // шаг 0.1
    };

    // нормализация дней (допускаем дробные)
    const clampDays = (v: unknown): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return cur.durationDayThreshold;
      const bounded = Math.min(Math.max(n, 0), 1000); // разумный верхний предел
      return Math.round(bounded * 100) / 100; // до 2 знаков
    };

    // склеим thresholds и обеспечим great ≤ average ≤ required
    let th = cur.thresholds;
    if (patch.thresholds) {
      const raw = { ...th, ...patch.thresholds };
      const required = clampPct(raw.requiredMaxPct);
      const average  = Math.min(clampPct(raw.averageMaxPct), required);
      const great    = Math.min(clampPct(raw.greatMaxPct), average);
      th = { requiredMaxPct: required, averageMaxPct: average, greatMaxPct: great };
    }

    const next: DcmaCheck10Advanced = {
      ...cur,
      ...patch,
      thresholds: th,
      detailsLimit: this.clampInt(patch.detailsLimit ?? cur.detailsLimit, 0, 1_000_000),
      durationDayThreshold: clampDays(patch.durationDayThreshold ?? cur.durationDayThreshold),
      includeDetails: (patch.includeDetails ?? cur.includeDetails) as boolean,
      ignoreMilestoneActivities: (patch.ignoreMilestoneActivities ?? cur.ignoreMilestoneActivities) as boolean,
      ignoreLoEActivities: (patch.ignoreLoEActivities ?? cur.ignoreLoEActivities) as boolean,
      ignoreWbsSummaryActivities: (patch.ignoreWbsSummaryActivities ?? cur.ignoreWbsSummaryActivities) as boolean,
      ignoreCompletedActivities: (patch.ignoreCompletedActivities ?? cur.ignoreCompletedActivities) as boolean,
    };

    this.adv10Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv10Key, JSON.stringify(next));
    }
  }

  /** Сборка опций для DcmaCheck10Service.analyzeCheck10(...) */
  buildCheck10Options(): DcmaCheck10Options {
    const a = this.adv10();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      durationDayThreshold: a.durationDayThreshold,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  /** KPI-оценка (для таблицы/бейджей) */
  evaluateCheck10Grade(percentWithoutResource: number): 'great' | 'average' | 'poor' {
    const { greatMaxPct, averageMaxPct } = this.adv10().thresholds;
    if (percentWithoutResource <= greatMaxPct) return 'great';
    if (percentWithoutResource <= averageMaxPct) return 'average';
    return 'poor';
  }

  /**
   * Pass/Fail: DCMA требование — процент задач без ресурсов среди
   * eligible (длительность >= thresholdDays) не должен превышать requiredMaxPct (обычно 0).
   */
  evaluateCheck10Pass(percentWithoutResource: number): boolean {
    return percentWithoutResource <= this.adv10().thresholds.requiredMaxPct;
  }

  // ==== I/O ====
  private loadAdv10(): DcmaCheck10Advanced {
    if (typeof window === 'undefined') return this.defaultAdv10();
    const raw = localStorage.getItem(this.adv10Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = { ...this.defaultAdv10(), ...parsed } as DcmaCheck10Advanced;
        return this.normalize(merged);
      } catch { /* ignore parse errors */ }
    }
    const def = this.defaultAdv10();
    localStorage.setItem(this.adv10Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv10(): DcmaCheck10Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      durationDayThreshold: 1,          // как в текущем сервисе
      // дефолтные фильтры — идентичны check10.service.ts
      ignoreMilestoneActivities: true,
      ignoreLoEActivities: true,
      ignoreWbsSummaryActivities: true,
      ignoreCompletedActivities: false,
      // DCMA: Pass должен быть 0%; KPI: Great ≤ 0%, Average ≤ 2%
      thresholds: { requiredMaxPct: 0.0, averageMaxPct: 2.0, greatMaxPct: 0.0 },
    };
  }

  private normalize(a: DcmaCheck10Advanced): DcmaCheck10Advanced {
    const clampPct = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      const bounded = Math.min(Math.max(n, 0), 100);
      return Math.round(bounded * 10) / 10;
    };
    const clampDays = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 1;
      const bounded = Math.min(Math.max(n, 0), 1000);
      return Math.round(bounded * 100) / 100;
    };
    const required = clampPct(a.thresholds.requiredMaxPct);
    const average  = Math.min(clampPct(a.thresholds.averageMaxPct), required);
    const great    = Math.min(clampPct(a.thresholds.greatMaxPct), average);
    return {
      ...a,
      durationDayThreshold: clampDays(a.durationDayThreshold),
      thresholds: { requiredMaxPct: required, averageMaxPct: average, greatMaxPct: great },
    };
  }

  private clampInt(v: unknown, min: number, max: number): number {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }
}