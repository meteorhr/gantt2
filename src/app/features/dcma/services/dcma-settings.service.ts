// src/app/dcma/services/dcma-settings.service.ts
import { Injectable, signal } from '@angular/core';
import {
  DcmaCheckId, DCMA_IDS, DcmaCheck1Advanced, DcmaCheck1AdvancedPatch,
  DcmaCheckCommonSettings, SETTINGS_STORAGE_KEY,
  DEFAULT_PERSISTED_V1, PersistedSettingsV1, normalizePersisted, DCMA_CHECK_LABELS
} from './dcma-checks.config';
import type { DcmaCheck2Options } from '../../../p6/services/dcma';

export { DCMA_IDS, DCMA_CHECK_LABELS };
export type { DcmaCheckId, DcmaCheck1Advanced, DcmaCheck1AdvancedPatch };

/** Локальный тип, чтобы не зависеть от компонента и не ломать isolatedModules */
export type DcmaCheck2Advanced = {
  strictZero: boolean;
  includeDetails: boolean;
  detailsLimit: number;
  hoursPerDay: number;
  calendarSource: 'successor' | 'predecessor' | 'fixed';
  fixedHoursPerDay: number;
  includeLinkTypes: { FS: boolean; SS: boolean; FF: boolean; SF: boolean };
  /** фильтры по типам активностей */
  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;
  /** KPI-пороги для визуальной оценки */
  thresholds: { greatPct: number; averagePct: number };
  /** Допуски, если strictZero=false */
  tolerance: { percent: number; count: number; totalLeadHours: number };
};

@Injectable({ providedIn: 'root' })
export class DcmaSettingsService {
  /** Вся сохранённая структура (общие + adv1) под единым ключом */
  private persisted = signal<PersistedSettingsV1>(DEFAULT_PERSISTED_V1);

  /** Общие настройки по чекам */
  readonly settings = signal<Record<DcmaCheckId, DcmaCheckCommonSettings>>(
    structuredClone(DEFAULT_PERSISTED_V1.common)
  );

  /** Advanced для Check 1 */
  readonly adv1 = signal<DcmaCheck1Advanced>(
    structuredClone(DEFAULT_PERSISTED_V1.adv1)
  );

  /** Advanced для Check 2 — отдельный ключ */
  private readonly adv2Key = 'dcma.adv.2';
  private adv2Signal = signal<DcmaCheck2Advanced>(this.loadAdv2());

  constructor() {
    // Подтянуть persisted + adv2 из localStorage (безопасно для SSR)
    this.loadFromLocalStorage();
  }

  /** Гарантируем дефолты в localStorage при первом заходе на вкладку */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(SETTINGS_STORAGE_KEY)) this.saveToLocalStorage();
    if (!localStorage.getItem(this.adv2Key)) {
      const def = this.defaultAdv2();
      localStorage.setItem(this.adv2Key, JSON.stringify(def));
      this.adv2Signal.set(def);
    }
  }

  // ========= Общие флаги ==========

  updateOne(id: DcmaCheckId, patch: Partial<DcmaCheckCommonSettings>): void {
    const cur = this.settings();
    const next = { ...cur, [id]: { ...cur[id], ...patch } };
    this.settings.set(next);

    const p = this.persisted();
    const p2: PersistedSettingsV1 = { ...p, common: next };
    this.persisted.set(p2);
    this.saveToLocalStorage();
  }

  reset(): void {
    this.persisted.set(structuredClone(DEFAULT_PERSISTED_V1));
    this.settings.set(structuredClone(DEFAULT_PERSISTED_V1.common));
    this.adv1.set(structuredClone(DEFAULT_PERSISTED_V1.adv1));

    const def2 = this.defaultAdv2();
    this.adv2Signal.set(def2);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv2Key, JSON.stringify(def2));
    }

    this.saveToLocalStorage();
  }

  // ========= Advanced Check 1 ==========

  patchAdv1(patch: DcmaCheck1AdvancedPatch): void {
    const cur = this.adv1();
    const next: DcmaCheck1Advanced = {
      ...cur,
      ...(patch as any),
      thresholds: { ...cur.thresholds, ...(patch.thresholds ?? {}) },
    };
    this.adv1.set(next);

    const p = this.persisted();
    const p2: PersistedSettingsV1 = { ...p, adv1: next };
    this.persisted.set(p2);
    this.saveToLocalStorage();
  }

  buildCheck1Options(): {
    excludeCompleted: boolean;
    excludeLoEAndHammock: boolean;
    ignoreLoEAndHammockLinksInLogic: boolean;
    treatMilestonesAsExceptions: boolean;
    includeLists: boolean;
    includeDQ: boolean;
  } {
    const a = this.adv1();
    return {
      excludeCompleted: !a.includeCompleted,
      excludeLoEAndHammock: !(a.includeLoE || a.includeWbsSummary),
      ignoreLoEAndHammockLinksInLogic: true,
      treatMilestonesAsExceptions: !!a.includeMilestones,
      includeLists: true,
      includeDQ: true,
    };
  }

  // ========= Advanced Check 2 ==========

  adv2(): DcmaCheck2Advanced { return this.adv2Signal(); }

  patchAdv2(patch: Partial<DcmaCheck2Advanced>) {
    const cur = this.adv2Signal();
    const next: DcmaCheck2Advanced = {
      ...cur,
      ...patch,
      includeLinkTypes: patch.includeLinkTypes
        ? { ...cur.includeLinkTypes, ...patch.includeLinkTypes }
        : cur.includeLinkTypes,
      tolerance: patch.tolerance
        ? { ...cur.tolerance, ...patch.tolerance }
        : cur.tolerance,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
    };
    this.adv2Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv2Key, JSON.stringify(next));
    }
  }

  /** Опции для сервиса анализа Check 2 */
  buildCheck2Options(): DcmaCheck2Options {
    const a = this.adv2();
    return {
      hoursPerDay: a.hoursPerDay,
      calendarSource: a.calendarSource,
      fixedHoursPerDay: a.fixedHoursPerDay,
      includeLinkTypes: (['FS','SS','FF','SF'] as const).filter(k => a.includeLinkTypes[k]),
      ignoreMilestoneRelations: a.ignoreMilestoneRelations,
      ignoreLoERelations: a.ignoreLoERelations,
      ignoreWbsSummaryRelations: a.ignoreWbsSummaryRelations,
      ignoreCompletedRelations: a.ignoreCompletedRelations,
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      tolerance: {
        strictZero: a.strictZero,
        percent: a.tolerance.percent,
        count: a.tolerance.count,
        totalLeadHours: a.tolerance.totalLeadHours
      }
    };
  }

  /** Визуальная оценка KPI (не влияет на pass при strictZero=true) */
  evaluateCheck2Grade(leadPercent: number): 'great'|'average'|'poor' {
    const { greatPct, averagePct } = this.adv2().thresholds;
    if (leadPercent <= greatPct) return 'great';
    if (leadPercent <= averagePct) return 'average';
    return 'poor';
    }

  /** Pass/Fail: strictZero → только 0%; иначе допуски */
  evaluateCheck2Pass(r: { leadCount: number; leadPercent: number; totalLeadHours?: number }): boolean {
    const a = this.adv2();
    if (a.strictZero) return r.leadCount === 0;
    const hrs = r.totalLeadHours ?? 0;
    return r.leadPercent <= a.tolerance.percent
        && r.leadCount   <= a.tolerance.count
        && hrs           <= a.tolerance.totalLeadHours;
  }

  // ========= I/O ==========

  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;

    // основной persisted (общие+adv1)
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      this.persisted.set(structuredClone(DEFAULT_PERSISTED_V1));
      this.settings.set(structuredClone(DEFAULT_PERSISTED_V1.common));
      this.adv1.set(structuredClone(DEFAULT_PERSISTED_V1.adv1));
    } else {
      try {
        const parsed = JSON.parse(raw);
        const norm = normalizePersisted(parsed);
        this.persisted.set(norm);
        this.settings.set(structuredClone(norm.common));
        this.adv1.set(structuredClone(norm.adv1));
      } catch {
        this.persisted.set(structuredClone(DEFAULT_PERSISTED_V1));
        this.settings.set(structuredClone(DEFAULT_PERSISTED_V1.common));
        this.adv1.set(structuredClone(DEFAULT_PERSISTED_V1.adv1));
      }
    }

    // adv2 — отдельный ключ
    const adv2raw = localStorage.getItem(this.adv2Key);
    if (adv2raw) {
      try {
        const merged = { ...this.defaultAdv2(), ...JSON.parse(adv2raw) };
        this.adv2Signal.set(merged);
      } catch {
        const def = this.defaultAdv2();
        this.adv2Signal.set(def);
        localStorage.setItem(this.adv2Key, JSON.stringify(def));
      }
    } else {
      const def = this.defaultAdv2();
      this.adv2Signal.set(def);
      localStorage.setItem(this.adv2Key, JSON.stringify(def));
    }
  }

  private saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    const p = this.persisted();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(p));
  }

  /** Загрузка adv2 для инициализации поля — SSR-safe */
  private loadAdv2(): DcmaCheck2Advanced {
    if (typeof window === 'undefined') return this.defaultAdv2();
    const raw = localStorage.getItem(this.adv2Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...this.defaultAdv2(), ...parsed };
      } catch {
        // упало — вернём дефолт и перезапишем
      }
    }
    const def = this.defaultAdv2();
    localStorage.setItem(this.adv2Key, JSON.stringify(def));
    return def;
  }

  /** Дефолты для Check 2 */
  private defaultAdv2(): DcmaCheck2Advanced {
    return {
      strictZero: true,
      includeDetails: true,
      detailsLimit: 500,
      hoursPerDay: 8,
      calendarSource: 'successor',
      fixedHoursPerDay: 8,
      includeLinkTypes: { FS: true, SS: true, FF: true, SF: true },
      ignoreMilestoneRelations: false,
      ignoreLoERelations: false,
      ignoreWbsSummaryRelations: false,
      ignoreCompletedRelations: false,
      thresholds: { greatPct: 0, averagePct: 2 }, // DCMA цель = 0%; KPI — для визуала
      tolerance: { percent: 0, count: 0, totalLeadHours: 0 }
    };
  }
}
