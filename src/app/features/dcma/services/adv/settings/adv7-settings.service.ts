// src/app/dcma/services/adv/adv7-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck7Advanced } from '../types/adv7-settings.types';
import type { DcmaCheck7Options } from '../../../../../p6/services/dcma/src/check/check7.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv7SettingsService {
  private readonly adv7Key = 'dcma.adv.7';
  private readonly adv7Signal = signal<DcmaCheck7Advanced>(this.loadAdv7());

  /** Текущие advanced-настройки Check 7 */
  adv7(): DcmaCheck7Advanced { return this.adv7Signal(); }

  /** SSR-safe инициализация дефолтов в localStorage */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv7Key)) {
      const def = this.defaultAdv7();
      localStorage.setItem(this.adv7Key, JSON.stringify(def));
      this.adv7Signal.set(def);
    }
  }

  /** Сброс только Check 7 к дефолтам */
  resetAdv7(): void {
    const def = this.defaultAdv7();
    this.adv7Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv7Key, JSON.stringify(def));
    }
  }

  /** Патч с нормализацией и упорядочиванием порогов KPI */
  patchAdv7(patch: Partial<DcmaCheck7Advanced>): void {
    const cur = this.adv7Signal();

    const clampInt = (v: unknown, min: number, max: number): number => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const clampPos = (v: unknown, min: number, max: number): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const clampPct = (v: unknown): number => {
      const n = Number(v);
      const safe = Number.isFinite(n) ? n : 0;
      const bounded = Math.max(0, Math.min(100, safe));
      return Math.round(bounded * 10) / 10; // шаг 0.1
    };

    let mode = cur.mode;
    if (patch.mode) {
      const merged = { ...mode, ...patch.mode };
      const t0 = merged.thresholds ?? mode.thresholds;
      const req = clampPct(t0.requiredMaxPct);
      const avg = Math.min(clampPct(t0.averageMaxPct), req);
      const grt = Math.min(clampPct(t0.greatMaxPct),   avg);
      mode = { strictZero: !!merged.strictZero, thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt } };
    }

    const next: DcmaCheck7Advanced = {
      ...cur,
      ...patch,
      includeDetails: (patch.includeDetails ?? cur.includeDetails) as boolean,
      detailsLimit: clampInt(patch.detailsLimit ?? cur.detailsLimit, 0, 1_000_000),
      hoursPerDay: clampPos(patch.hoursPerDay ?? cur.hoursPerDay, 1, 24),
      toleranceHours: Math.max(0, Number(patch.toleranceHours ?? cur.toleranceHours) || 0),
      ignoreMilestoneActivities: (patch.ignoreMilestoneActivities ?? cur.ignoreMilestoneActivities) as boolean,
      ignoreLoEActivities: (patch.ignoreLoEActivities ?? cur.ignoreLoEActivities) as boolean,
      ignoreWbsSummaryActivities: (patch.ignoreWbsSummaryActivities ?? cur.ignoreWbsSummaryActivities) as boolean,
      ignoreCompletedActivities: (patch.ignoreCompletedActivities ?? cur.ignoreCompletedActivities) as boolean,
      mode,
    };

    this.adv7Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv7Key, JSON.stringify(next));
    }
  }

  /** Опции для DcmaCheck7Service.analyzeCheck7(...) */
  buildCheck7Options(): DcmaCheck7Options {
    const a = this.adv7();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      hoursPerDay: a.hoursPerDay,                 // фолбэк; основной HPD берётся из календарей
      toleranceHours: a.toleranceHours,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  /** KPI-оценка (визуальная): Great/Average/Poor по проценту нарушителей */
  evaluateCheck7Grade(negativeFloatCount: number, totalEligible: number): 'great'|'average'|'poor' {
    const pct = this.round2(this.safePercent(negativeFloatCount, totalEligible));
    const { greatMaxPct, averageMaxPct } = this.adv7().mode.thresholds;
    if (pct <= greatMaxPct)   return 'great';
    if (pct <= averageMaxPct) return 'average';
    return 'poor';
  }

  /**
   * Pass/Fail:
   * - strictZero=true  → Pass, если negativeFloatCount === 0
   * - strictZero=false → Pass, если percent ≤ requiredMaxPct
   */
  evaluateCheck7Pass(negativeFloatCount: number, totalEligible: number): boolean {
    const a = this.adv7();
    if (a.mode.strictZero) return negativeFloatCount === 0;
    const pct = this.round2(this.safePercent(negativeFloatCount, totalEligible));
    return pct <= a.mode.thresholds.requiredMaxPct;
  }

  // ==== утилиты ====
  private safePercent(num: number, den: number): number {
    const d = Math.max(1, Number(den) || 0);
    const n = Math.max(0, Number(num) || 0);
    return (n / d) * 100;
  }
  private round2(n: number): number { return Math.round(n * 100) / 100; }

  // ==== I/O ====
  private loadAdv7(): DcmaCheck7Advanced {
    if (typeof window === 'undefined') return this.defaultAdv7();
    const raw = localStorage.getItem(this.adv7Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<DcmaCheck7Advanced>;
        const merged = { ...this.defaultAdv7(), ...parsed } as DcmaCheck7Advanced;
        return this.normalize(merged);
      } catch { /* ignore parse errors */ }
    }
    const def = this.defaultAdv7();
    localStorage.setItem(this.adv7Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv7(): DcmaCheck7Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      hoursPerDay: 8,            // фолбэк; основной HPD берём из календарей
      toleranceHours: 0,         // строгое DCMA
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      mode: {
        strictZero: true,        // DCMA-строго: нарушителей должно быть 0
        // KPI по умолчанию: Great=0%, Average=0% (т.е. любое отклонение — «poor»)
        thresholds: { requiredMaxPct: 0.0, averageMaxPct: 0.0, greatMaxPct: 0.0 },
      },
    };
  }

  private normalize(a: DcmaCheck7Advanced): DcmaCheck7Advanced {
    const clampInt = (v: unknown, min: number, max: number) => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const clampPos = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const clampPct = (v: unknown): number => {
      const n = Number(v);
      const safe = Number.isFinite(n) ? n : 0;
      const bounded = Math.max(0, Math.min(100, n == null ? 0 : safe));
      return Math.round(bounded * 10) / 10;
    };

    const req = clampPct(a.mode.thresholds.requiredMaxPct);
    const avg = Math.min(clampPct(a.mode.thresholds.averageMaxPct), req);
    const grt = Math.min(clampPct(a.mode.thresholds.greatMaxPct),   avg);

    return {
      ...a,
      detailsLimit: clampInt(a.detailsLimit, 0, 1_000_000),
      hoursPerDay: clampPos(a.hoursPerDay, 1, 24),
      toleranceHours: Math.max(0, Number(a.toleranceHours) || 0),
      mode: {
        strictZero: !!a.mode.strictZero,
        thresholds: { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt },
      },
    };
  }
}