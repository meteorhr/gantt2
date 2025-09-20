// src/app/dcma/services/adv/adv9-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck9Advanced } from '../types/adv9-settings.types';
import type { DcmaCheck9Options } from '../../../../../p6/services/dcma/src/check/check9.service';
import type { DcmaCheck9Result } from '../../../../../p6/services/dcma/models/dcma.model';

@Injectable({ providedIn: 'root' })
export class DcmaAdv9SettingsService {
  private readonly adv9Key = 'dcma.adv.9';
  private readonly adv9Signal = signal<DcmaCheck9Advanced>(this.loadAdv9());

  /** Доступ к текущим настройкам */
  adv9(): DcmaCheck9Advanced { return this.adv9Signal(); }

  /** SSR-safe инициализация дефолтов в localStorage */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv9Key)) {
      const def = this.defaultAdv9();
      localStorage.setItem(this.adv9Key, JSON.stringify(def));
      this.adv9Signal.set(def);
    }
  }

  /** Сброс только настроек Check 9 к дефолтам */
  resetAdv9(): void {
    const def = this.defaultAdv9();
    this.adv9Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv9Key, JSON.stringify(def));
    }
  }

  /** Частичный патч с нормализацией дней/счётчиков, мёрджем thresholds */
  patchAdv9(patch: Partial<DcmaCheck9Advanced>): void {
    const cur = this.adv9Signal();

    const clampInt = (v: unknown, min: number, max: number) => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };

    // Толерансы в днях — целые, неотрицательные
    const tolForecast = patch.forecastToleranceDays != null
      ? clampInt(patch.forecastToleranceDays, 0, 3650)
      : cur.forecastToleranceDays;
    const tolActual = patch.actualToleranceDays != null
      ? clampInt(patch.actualToleranceDays, 0, 3650)
      : cur.actualToleranceDays;

    // thresholds: great ≤ average ≤ required
    let th = cur.thresholds;
    if (patch.thresholds) {
      const raw = { ...th, ...patch.thresholds };
      const req = clampInt(raw.requiredMaxTotalCount, 0, 1_000_000);
      const avg = Math.min(clampInt(raw.averageMaxTotalCount, 0, 1_000_000), req);
      const grt = Math.min(clampInt(raw.greatMaxTotalCount,   0, 1_000_000), avg);
      th = { requiredMaxTotalCount: req, averageMaxTotalCount: avg, greatMaxTotalCount: grt };
    }

    const next: DcmaCheck9Advanced = {
      ...cur,
      ...patch,
      thresholds: th,
      includeDetails: (patch.includeDetails ?? cur.includeDetails) as boolean,
      detailsLimit: clampInt(patch.detailsLimit ?? cur.detailsLimit, 0, 1_000_000),
      forecastToleranceDays: tolForecast,
      actualToleranceDays: tolActual,
      ignoreMilestoneActivities: (patch.ignoreMilestoneActivities ?? cur.ignoreMilestoneActivities) as boolean,
      ignoreLoEActivities: (patch.ignoreLoEActivities ?? cur.ignoreLoEActivities) as boolean,
      ignoreWbsSummaryActivities: (patch.ignoreWbsSummaryActivities ?? cur.ignoreWbsSummaryActivities) as boolean,
      ignoreCompletedActivities: (patch.ignoreCompletedActivities ?? cur.ignoreCompletedActivities) as boolean,
    };

    this.adv9Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv9Key, JSON.stringify(next));
    }
  }

  /** Сборка опций для DcmaCheck9Service.analyzeCheck9(...) */
  buildCheck9Options(): DcmaCheck9Options {
    const a = this.adv9();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      forecastToleranceDays: a.forecastToleranceDays,
      actualToleranceDays: a.actualToleranceDays,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  /** Удобный хелпер для суммирования нарушений */
  totalInvalid(r: Pick<DcmaCheck9Result, 'invalidForecastCount' | 'invalidActualCount'>): number {
    return Math.max(0, (r?.invalidForecastCount ?? 0)) + Math.max(0, (r?.invalidActualCount ?? 0));
  }

  /** KPI-оценка на основе totalInvalid */
  evaluateCheck9Grade(totalInvalid: number): 'great' | 'average' | 'poor' {
    const { greatMaxTotalCount, averageMaxTotalCount } = this.adv9().thresholds;
    if (totalInvalid <= greatMaxTotalCount) return 'great';
    if (totalInvalid <= averageMaxTotalCount) return 'average';
    return 'poor';
  }

  /** Pass/Fail: totalInvalid ≤ requiredMaxTotalCount */
  evaluateCheck9Pass(totalInvalid: number): boolean {
    return totalInvalid <= this.adv9().thresholds.requiredMaxTotalCount;
  }

  // ==== I/O ====
  private loadAdv9(): DcmaCheck9Advanced {
    if (typeof window === 'undefined') return this.defaultAdv9();
    const raw = localStorage.getItem(this.adv9Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = { ...this.defaultAdv9(), ...parsed } as DcmaCheck9Advanced;
        return this.normalize(merged);
      } catch { /* ignore parse errors */ }
    }
    const def = this.defaultAdv9();
    localStorage.setItem(this.adv9Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv9(): DcmaCheck9Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      forecastToleranceDays: 0,
      actualToleranceDays: 0,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      // DCMA: как правило требование — 0 нарушений
      thresholds: { requiredMaxTotalCount: 0, averageMaxTotalCount: 0, greatMaxTotalCount: 0 },
    };
  }

  private normalize(a: DcmaCheck9Advanced): DcmaCheck9Advanced {
    const clampInt = (v: unknown, min: number, max: number) => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n)) return min;
      return Math.max(min, Math.min(max, n));
    };
    const req = clampInt(a.thresholds.requiredMaxTotalCount, 0, 1_000_000);
    const avg = Math.min(clampInt(a.thresholds.averageMaxTotalCount, 0, 1_000_000), req);
    const grt = Math.min(clampInt(a.thresholds.greatMaxTotalCount,   0, 1_000_000), avg);

    return {
      ...a,
      detailsLimit: clampInt(a.detailsLimit, 0, 1_000_000),
      forecastToleranceDays: clampInt(a.forecastToleranceDays, 0, 3650),
      actualToleranceDays: clampInt(a.actualToleranceDays, 0, 3650),
      thresholds: { requiredMaxTotalCount: req, averageMaxTotalCount: avg, greatMaxTotalCount: grt },
    };
  }
}