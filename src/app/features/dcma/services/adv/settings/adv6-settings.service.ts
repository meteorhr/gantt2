import { Injectable, signal } from '@angular/core';
import type { DcmaCheck6Advanced } from '../types/adv6-settings.types';
import type { DcmaCheck6Options } from '../../../../../p6/services/dcma'; // barrel должен экспортировать DcmaCheck6Options

/** Ключ хранения для Check 6 */
const ADV6_KEY = 'dcma.adv.6';

/** Нормализация чисел (целые, мин=0) */
function clampInt(n: unknown, min = 0): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(min, v) : min;
}

/** Нормализация процентов 0..100 с шагом 0.1 и округлением до 1 знака */
function clampPct(n: unknown): number {
  const v = Number(n);
  const bounded = Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));
  return Math.round(bounded * 10) / 10;
}

/** Авто-валидатор порядка great ≤ average ≤ required */
function normalizeThresholds(t: { requiredMaxPct: number; averageMaxPct: number; greatMaxPct: number }) {
  const req = clampPct(t.requiredMaxPct);
  const avg = Math.min(clampPct(t.averageMaxPct), req);
  const grt = Math.min(clampPct(t.greatMaxPct), avg);
  return { requiredMaxPct: req, averageMaxPct: avg, greatMaxPct: grt };
}

/** Дефолты для Check 6 */
function defaultAdv6(): DcmaCheck6Advanced {
  return {
    includeDetails: true,
    detailsLimit: 500,
    hoursPerDay: 8,
    dayThreshold: 44,

    ignoreMilestoneActivities: false,
    ignoreLoEActivities: false,
    ignoreWbsSummaryActivities: false,
    ignoreCompletedActivities: false,

    // DCMA pass ≤ 5%; KPI: Great ≤ 2%, Average ≤ 5%
    thresholds: { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 2.0 },
  };
}

@Injectable({ providedIn: 'root' })
export class DcmaAdv6SettingsService {
  private adv6Signal = signal<DcmaCheck6Advanced>(this.loadAdv6());

  /** Текущее состояние Advanced-6 */
  adv6(): DcmaCheck6Advanced { return this.adv6Signal(); }

  /** Патч с умным слиянием thresholds и авто-валидацией порядка ≤ */
  patchAdv6(patch: Partial<DcmaCheck6Advanced>): void {
    const cur = this.adv6Signal();
    const mergedThr = patch.thresholds
      ? normalizeThresholds({ ...cur.thresholds, ...patch.thresholds })
      : cur.thresholds;

    const next: DcmaCheck6Advanced = {
      ...cur,
      ...patch,
      detailsLimit: patch.detailsLimit !== undefined ? clampInt(patch.detailsLimit) : cur.detailsLimit,
      hoursPerDay: patch.hoursPerDay !== undefined ? clampInt(patch.hoursPerDay, 1) : cur.hoursPerDay,
      dayThreshold: patch.dayThreshold !== undefined ? clampInt(patch.dayThreshold, 1) : cur.dayThreshold,
      thresholds: mergedThr,
    };

    this.adv6Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ADV6_KEY, JSON.stringify(next));
    }
  }

  /** Сбор опций для DcmaCheck6Service.analyzeCheck6 */
  buildCheck6Options(): DcmaCheck6Options {
    const a = this.adv6Signal();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      fallbackHoursPerDay: a.hoursPerDay,
      dayThreshold: a.dayThreshold,
      thresholds: a.thresholds,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  /** KPI-оценка: great/average/poor по доле high float */
  evaluateCheck6Grade(percentHighFloat: number): 'great' | 'average' | 'poor' {
    const { greatMaxPct, averageMaxPct } = this.adv6Signal().thresholds;
    if (percentHighFloat <= greatMaxPct) return 'great';
    if (percentHighFloat <= averageMaxPct) return 'average';
    return 'poor';
  }

  /** Pass: percentHighFloat ≤ requiredMaxPct (DCMA required) */
  evaluateCheck6Pass(percentHighFloat: number): boolean {
    return percentHighFloat <= this.adv6Signal().thresholds.requiredMaxPct;
  }

  /** Гарантируем дефолты в localStorage (SSR-safe) */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(ADV6_KEY)) {
      const def = defaultAdv6();
      localStorage.setItem(ADV6_KEY, JSON.stringify(def));
      this.adv6Signal.set(def);
    }
  }

  /** Сброс к дефолтам (используется фасадом) */
  resetAdv6(): void {
    const def = defaultAdv6();
    this.adv6Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ADV6_KEY, JSON.stringify(def));
    }
  }

  /** Алиас на resetAdv6 для совместимости */
  reset(): void { this.resetAdv6(); }

  // ======== I/O ========

  private loadAdv6(): DcmaCheck6Advanced {
    const def = defaultAdv6();
    if (typeof window === 'undefined') return def;
    const raw = localStorage.getItem(ADV6_KEY);
    if (!raw) return def;
    try {
      const parsed = JSON.parse(raw) as Partial<DcmaCheck6Advanced>;
      const merged: DcmaCheck6Advanced = {
        ...def,
        ...parsed,
        detailsLimit: parsed.detailsLimit !== undefined ? clampInt(parsed.detailsLimit) : def.detailsLimit,
        hoursPerDay: parsed.hoursPerDay !== undefined ? clampInt(parsed.hoursPerDay, 1) : def.hoursPerDay,
        dayThreshold: parsed.dayThreshold !== undefined ? clampInt(parsed.dayThreshold, 1) : def.dayThreshold,
        thresholds: normalizeThresholds({ ...def.thresholds, ...(parsed.thresholds ?? {}) }),
      };
      return merged;
    } catch {
      localStorage.setItem(ADV6_KEY, JSON.stringify(def));
      return def;
    }
  }
}