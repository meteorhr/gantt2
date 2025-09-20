// src/app/dcma/services/dcma-settings.service.ts
import { Injectable, signal } from '@angular/core';
import {
  DcmaCheckId, DCMA_IDS, DcmaCheck1Advanced, DcmaCheck1AdvancedPatch,
  DcmaCheckCommonSettings, SETTINGS_STORAGE_KEY,
  DEFAULT_PERSISTED_V1, PersistedSettingsV1, normalizePersisted, DCMA_CHECK_LABELS
} from './dcma-checks.config';
import type { DcmaCheck2Options, DcmaCheck3Options, DcmaCheck4Options, DcmaCheck5Options } from '../../../p6/services/dcma';



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

export type DcmaCheck3Advanced = {
  includeDetails: boolean;
  detailsLimit: number;

  hoursPerDay: number;
  calendarSource: 'successor' | 'predecessor' | 'fixed';
  fixedHoursPerDay: number;

  includeLinkTypes: { FS: boolean; SS: boolean; FF: boolean; SF: boolean };

  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;

  /** KPI-пороги для визуальной оценки (не влияют на pass) */
  thresholds: { greatPct: number; averagePct: number };

  /** Допуски (если strictFivePct=false) */
  tolerance: { strictFivePct: boolean; percent: number; count: number; totalLagHours: number };
};

// ДОБАВЬ ТИП
export type DcmaCheck4Advanced = {
  includeDetails: boolean;
  detailsLimit: number;

  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;

  dedupMode: 'byType' | 'byTypeAndLag';

  thresholds: { requiredPct: number; averagePct: number; greatPct: number };
};

// ======== Advanced Check 5 ========
export type DcmaCheck5Advanced = {
    includeDetails: boolean;
    detailsLimit: number;
    ignoreMilestoneActivities: boolean;
    ignoreLoEActivities: boolean;
    ignoreWbsSummaryActivities: boolean;
    ignoreCompletedActivities: boolean;
    thresholds: { requiredMaxPct: number; averageMaxPct: number; greatMaxPct: number };
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
    if (!localStorage.getItem(this.adv5Key)) {
      const def5 = this.defaultAdv5();
      localStorage.setItem(this.adv5Key, JSON.stringify(def5));
      this.adv5Signal.set(def5);
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
    const def5 = this.defaultAdv5();
    this.adv5Signal.set(def5);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv5Key, JSON.stringify(def5));
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

  /** Advanced для Check 3 — отдельный ключ */
  private readonly adv3Key = 'dcma.adv.3';
  private adv3Signal = signal<DcmaCheck3Advanced>(this.loadAdv3());

  // ======== Advanced Check 3 ========

  adv3(): DcmaCheck3Advanced { return this.adv3Signal(); }

  patchAdv3(patch: Partial<DcmaCheck3Advanced>) {
    const cur = this.adv3Signal();
    const next: DcmaCheck3Advanced = {
      ...cur,
      ...patch,
      includeLinkTypes: patch.includeLinkTypes
        ? { ...cur.includeLinkTypes, ...patch.includeLinkTypes }
        : cur.includeLinkTypes,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
      tolerance: patch.tolerance
        ? { ...cur.tolerance, ...patch.tolerance }
        : cur.tolerance,
    };
    this.adv3Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv3Key, JSON.stringify(next));
    }
  }

  /** Опции для сервиса анализа Check 3 */
  buildCheck3Options(): DcmaCheck3Options {
    const a = this.adv3();
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
        strictFivePct: a.tolerance.strictFivePct,
        percent: a.tolerance.percent,
        count: a.tolerance.count,
        totalLagHours: a.tolerance.totalLagHours,
      }
    };
  }

  /** Визуальная оценка KPI */
  evaluateCheck3Grade(lagPercent: number): 'great'|'average'|'poor' {
    const { greatPct, averagePct } = this.adv3().thresholds;
    if (lagPercent <= greatPct) return 'great';
    if (lagPercent <= averagePct) return 'average';
    return 'poor';
  }

  /** Pass/Fail для Check 3 */
  evaluateCheck3Pass(r: { lagCount: number; lagPercent: number; totalLagHours?: number }): boolean {
    const a = this.adv3();
    if (a.tolerance.strictFivePct) return r.lagPercent <= 5;
    const hrs = r.totalLagHours ?? 0;
    return r.lagPercent <= a.tolerance.percent
        && r.lagCount   <= a.tolerance.count
        && hrs          <= a.tolerance.totalLagHours;
  }

  // ======== I/O adv3 ========

  private loadAdv3(): DcmaCheck3Advanced {
    if (typeof window === 'undefined') return this.defaultAdv3();
    const raw = localStorage.getItem(this.adv3Key);
    if (raw) {
      try { return { ...this.defaultAdv3(), ...JSON.parse(raw) }; } catch {}
    }
    const def = this.defaultAdv3();
    localStorage.setItem(this.adv3Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv3(): DcmaCheck3Advanced {
    return {
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

      // KPI: «Great» до 2%, «Average» до 5% (DCMA порог)
      thresholds: { greatPct: 2, averagePct: 5 },

      // Толерансы: по умолчанию строжайшее правило DCMA 5%
      tolerance: { strictFivePct: true, percent: 5, count: Number.POSITIVE_INFINITY, totalLagHours: Number.POSITIVE_INFINITY },
    };
  }

  // ========= Advanced Check 4 ==========
  // ======== Advanced Check 4 ========
private readonly adv4Key = 'dcma.adv.4';
private adv4Signal = signal<DcmaCheck4Advanced>(this.loadAdv4());

adv4(): DcmaCheck4Advanced { return this.adv4Signal(); }

patchAdv4(patch: Partial<DcmaCheck4Advanced>) {
  const cur = this.adv4Signal();
  const next: DcmaCheck4Advanced = {
    ...cur,
    ...patch,
    thresholds: patch.thresholds ? { ...cur.thresholds, ...patch.thresholds } : cur.thresholds,
  };
  this.adv4Signal.set(next);
  if (typeof window !== 'undefined') {
    localStorage.setItem(this.adv4Key, JSON.stringify(next));
  }
}


buildCheck4Options(): DcmaCheck4Options {
  const a = this.adv4();
  return {
    includeDetails: a.includeDetails,
    detailsLimit: a.detailsLimit,
    ignoreMilestoneRelations: a.ignoreMilestoneRelations,
    ignoreLoERelations: a.ignoreLoERelations,
    ignoreWbsSummaryRelations: a.ignoreWbsSummaryRelations,
    ignoreCompletedRelations: a.ignoreCompletedRelations,
    dedupMode: a.dedupMode
  };
}

evaluateCheck4Grade(fsPercent: number): 'great'|'average'|'poor' {
  const { requiredPct, averagePct, greatPct } = this.adv4().thresholds;
  if (fsPercent >= greatPct) return 'great';
  if (fsPercent >= averagePct) return 'average';
  // ниже average — «poor»
  return 'poor';
}

evaluateCheck4Pass(fsPercent: number): boolean {
  return fsPercent >= this.adv4().thresholds.requiredPct; // DCMA рекомендует 90%
}

// ======== I/O adv4 ========
private loadAdv4(): DcmaCheck4Advanced {
  if (typeof window === 'undefined') return this.defaultAdv4();
  const raw = localStorage.getItem(this.adv4Key);
  if (raw) {
    try { return { ...this.defaultAdv4(), ...JSON.parse(raw) }; } catch {}
  }
  const def = this.defaultAdv4();
  localStorage.setItem(this.adv4Key, JSON.stringify(def));
  return def;
}

private defaultAdv4(): DcmaCheck4Advanced {
  return {
    includeDetails: true,
    detailsLimit: 500,

    ignoreMilestoneRelations: false,
    ignoreLoERelations: false,
    ignoreWbsSummaryRelations: false,
    ignoreCompletedRelations: false,

    dedupMode: 'byType',

    // DCMA pass ≥ 90%; KPI для визуала: Average ≥90, Great ≥95
    thresholds: { requiredPct: 90, averagePct: 90, greatPct: 95 },
  };
}


  // ========= Advanced Check 5 =========
  private readonly adv5Key = 'dcma.adv.5';
  private adv5Signal = signal<DcmaCheck5Advanced>(this.loadAdv5());

  adv5(): DcmaCheck5Advanced { return this.adv5Signal(); }

  patchAdv5(patch: Partial<DcmaCheck5Advanced>): void {
    const cur = this.adv5Signal();
    const next: DcmaCheck5Advanced = {
      ...cur,
      ...patch,
      thresholds: patch.thresholds
        ? { ...cur.thresholds, ...patch.thresholds }
        : cur.thresholds,
    };
    this.adv5Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv5Key, JSON.stringify(next));
    }
  }

  buildCheck5Options(): DcmaCheck5Options {
    const a = this.adv5();
    return {
      includeDetails: a.includeDetails,
      detailsLimit: a.detailsLimit,
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  evaluateCheck5Grade(percentHard: number): 'great'|'average'|'poor' {
    const { greatMaxPct, averageMaxPct } = this.adv5().thresholds;
    if (percentHard <= greatMaxPct) return 'great';
    if (percentHard <= averageMaxPct) return 'average';
    return 'poor';
  }

  evaluateCheck5Pass(percentHard: number): boolean {
    return percentHard <= this.adv5().thresholds.requiredMaxPct;
  }

  private loadAdv5(): DcmaCheck5Advanced {
    if (typeof window === 'undefined') return this.defaultAdv5();
    const raw = localStorage.getItem(this.adv5Key);
    if (raw) {
      try { return { ...this.defaultAdv5(), ...JSON.parse(raw) }; } catch {}
    }
    const def = this.defaultAdv5();
    localStorage.setItem(this.adv5Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv5(): DcmaCheck5Advanced {
    return {
      includeDetails: true,
      detailsLimit: 500,
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
      thresholds: { requiredMaxPct: 5.0, averageMaxPct: 5.0, greatMaxPct: 1.0 },
    };
  }

}
