// src/app/dcma/services/adv/adv8-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck8Advanced } from '../types/adv8-settings.types';
import type { DcmaCheck8Options } from '../../../../../p6/services/dcma/src/check/check8.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv8SettingsService {
  private readonly adv8Key = 'dcma.adv.8';
  private readonly adv8Signal = signal<DcmaCheck8Advanced>(this.loadAdv8());

  /** Текущие advanced-настройки Check 8 */
  adv8(): DcmaCheck8Advanced { return this.adv8Signal(); }

  /** SSR-safe: гарантируем наличие дефолтов в localStorage */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv8Key)) {
      const def = this.defaultAdv8();
      localStorage.setItem(this.adv8Key, JSON.stringify(def));
      this.adv8Signal.set(def);
    }
  }

  /** Сброс только настроек Check 8 к дефолтам */
  resetAdv8(): void {
    const def = this.defaultAdv8();
    this.adv8Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv8Key, JSON.stringify(def));
    }
  }

  /** Частичный патч с нормализацией числовых полей и упорядочиванием порогов */
  patchAdv8(patch: Partial<DcmaCheck8Advanced>): void {
    const cur = this.adv8Signal();

    const clampInt = (v: unknown, min: number, max: number): number => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const clampPct = (v: unknown): number => {
      const num = Number(v);
      const safe = Number.isFinite(num) ? num : 0;
      const bounded = Math.max(0, Math.min(100, safe));
      return Math.round(bounded * 10) / 10; // шаг 0.1
    };
    const clampPos = (v: unknown, min: number, max: number): number => {
      const num = Number(v);
      if (!Number.isFinite(num)) return min;
      return Math.max(min, Math.min(max, num));
    };

    // нормализуем thresholds: great ≤ average ≤ required
    let th = cur.thresholds;
    if (patch.thresholds) {
      const raw = { ...th, ...patch.thresholds };
      const req = clampPct(raw.requiredMaxPct);
      const avg = Math.min(clampPct(raw.averageMaxPct), req);
      const grt = Math.min(clampPct(raw.greatMaxPct), avg);
      th = { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt };
    }

    const next: DcmaCheck8Advanced = {
      ...cur,
      ...patch,
      includeDetails: (patch.includeDetails ?? cur.includeDetails) as boolean,
      detailsLimit: clampInt(patch.detailsLimit ?? cur.detailsLimit, 0, 1_000_000),
      thresholdDays: clampPos(patch.thresholdDays ?? cur.thresholdDays, 0, 10_000),
      hoursPerDay: clampPos(patch.hoursPerDay ?? cur.hoursPerDay, 1, 24),
      thresholds: th,
      ignoreMilestoneActivities: (patch.ignoreMilestoneActivities ?? cur.ignoreMilestoneActivities) as boolean,
      ignoreLoEActivities: (patch.ignoreLoEActivities ?? cur.ignoreLoEActivities) as boolean,
      ignoreWbsSummaryActivities: (patch.ignoreWbsSummaryActivities ?? cur.ignoreWbsSummaryActivities) as boolean,
      ignoreCompletedActivities: (patch.ignoreCompletedActivities ?? cur.ignoreCompletedActivities) as boolean,
    };

    this.adv8Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv8Key, JSON.stringify(next));
    }
  }

  /** Сборка опций для DcmaCheck8Service.analyzeCheck8(...) */
  buildCheck8Options(): DcmaCheck8Options {
    const a = this.adv8();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      hoursPerDay: a.hoursPerDay,               // фолбэк; основной HPD берём из календаря
      thresholdDays: a.thresholdDays,
      thresholds: {
        requiredMaxPct: a.thresholds.requiredMaxPct,
        averageMaxPct: a.thresholds.averageMaxPct,
        greatMaxPct: a.thresholds.greatMaxPct,
      },
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  /** KPI-оценка (визуальная): Great/Average/Poor на основе процента нарушителей */
  evaluateCheck8Grade(percentHighDuration: number): 'great' | 'average' | 'poor' {
    const { greatMaxPct, averageMaxPct } = this.adv8().thresholds;
    if (percentHighDuration <= greatMaxPct) return 'great';
    if (percentHighDuration <= averageMaxPct) return 'average';
    return 'poor';
  }

  /** Pass/Fail: percentHighDuration ≤ requiredMaxPct */
  evaluateCheck8Pass(percentHighDuration: number): boolean {
    return percentHighDuration <= this.adv8().thresholds.requiredMaxPct;
  }

  // ==== I/O ====
  private loadAdv8(): DcmaCheck8Advanced {
    if (typeof window === 'undefined') return this.defaultAdv8();
    const raw = localStorage.getItem(this.adv8Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = { ...this.defaultAdv8(), ...parsed } as DcmaCheck8Advanced;
        return this.normalize(merged);
      } catch { /* ignore parse errors */ }
    }
    const def = this.defaultAdv8();
    localStorage.setItem(this.adv8Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv8(): DcmaCheck8Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      thresholdDays: 44, // DCMA
      hoursPerDay: 8,    // фолбэк; основной HPD берётся из календарей
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      // DCMA Pass ≤ 5%; KPI: Great ≤ 2%, Average ≤ 5%
      thresholds: { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 2.0 },
    };
  }

  private normalize(a: DcmaCheck8Advanced): DcmaCheck8Advanced {
    const clampInt = (v: unknown, min: number, max: number) => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const clampPct = (v: unknown): number => {
      const num = Number(v);
      const safe = Number.isFinite(num) ? num : 0;
      const bounded = Math.max(0, Math.min(100, safe));
      return Math.round(bounded * 10) / 10;
    };
    const req = clampPct(a.thresholds.requiredMaxPct);
    const avg = Math.min(clampPct(a.thresholds.averageMaxPct), req);
    const grt = Math.min(clampPct(a.thresholds.greatMaxPct),   avg);

    return {
      ...a,
      detailsLimit: clampInt(a.detailsLimit, 0, 1_000_000),
      thresholdDays: Math.max(0, Math.min(10_000, Number(a.thresholdDays) || 0)),
      hoursPerDay: Math.max(1, Math.min(24, Number(a.hoursPerDay) || 8)),
      thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt },
    };
  }
}