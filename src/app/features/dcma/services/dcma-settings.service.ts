// src/app/features/dcma/services/dcma-settings.service.ts
import { Injectable, signal } from '@angular/core';

export interface DcmaCheckSettings {
  enabled: boolean;
  showInTable: boolean;
}

export type DcmaCheck1AdvancedPatch =
  Partial<Omit<DcmaCheck1Advanced, 'thresholds'>> & {
    thresholds?: Partial<DcmaCheck1Advanced['thresholds']>;
  };

// Фиксированный набор ID чеков DCMA
export type DcmaCheckId =
  1|2|3|4|5|6|7|8|9|10|11|12|13|14;

export const DCMA_IDS: readonly DcmaCheckId[] =
  [1,2,3,4,5,6,7,8,9,10,11,12,13,14] as const;

export type DcmaSettingsMap = Record<DcmaCheckId, DcmaCheckSettings>;

function buildDefaults(): DcmaSettingsMap {
  const map = {} as DcmaSettingsMap;
  for (const id of DCMA_IDS) map[id] = { enabled: true, showInTable: true };
  return map;
}

// ====== ADVANCED НАСТРОЙКИ (Check 1 — Missing Logic) ======
export interface DcmaCheck1Advanced {
  /** Плитка на главном экране (Dashboard) */
  showOnMain: boolean;
  /** Включать task/resource dependent activities */
  includeTaskResDep: boolean;
  /** Включать milestones */
  includeMilestones: boolean;
  /** Включать level of effort */
  includeLoE: boolean;
  /** Включать WBS summary */
  includeWbsSummary: boolean;
  /** Включать завершённые */
  includeCompleted: boolean;
  /** Включать obsolete (зарезервировано) */
  includeObsolete: boolean;
  /** Пороговые уровни для визуализации */
  thresholds: { greatPct: number; averagePct: number };
}

export type DcmaAdvancedSettings = {
  1: DcmaCheck1Advanced;
};

function adv1Defaults(): DcmaCheck1Advanced {
  return {
    showOnMain: false,
    includeTaskResDep: true,
    includeMilestones: true,
    includeLoE: false,
    includeWbsSummary: false,
    includeCompleted: false,
    includeObsolete: false,
    thresholds: { greatPct: 7, averagePct: 7 },
  };
}

function buildAdvancedDefaults(): DcmaAdvancedSettings {
  return { 1: adv1Defaults() };
}
// ===========================================================

@Injectable({ providedIn: 'root' })
export class DcmaSettingsService {
  private readonly storageKey    = 'dcma.checks.settings.v1';
  private readonly storageKeyAdv = 'dcma.checks.advanced.v1';

  /** Базовые флаги включения/видимости по каждому чеку (1..14) */
  readonly settings = signal<DcmaSettingsMap>(this.load());
  /** Расширенные настройки (пока — только Check 1) */
  readonly advanced = signal<DcmaAdvancedSettings>(this.loadAdvanced());

  // ---------- BASIC ----------
  private load(): DcmaSettingsMap {
    const def = buildDefaults();
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return def;

      const parsed = JSON.parse(raw) as Record<string, Partial<DcmaCheckSettings>>;
      for (const [k, v] of Object.entries(parsed)) {
        const idNum = Number(k);
        if (Number.isInteger(idNum) && DCMA_IDS.includes(idNum as DcmaCheckId) && v) {
          const id = idNum as DcmaCheckId;
          def[id] = { ...def[id], ...v };
        }
      }
    } catch (e) {
      console.warn('[DcmaSettings] load failed:', e);
    }
    return def;
  }

  private persist(next: DcmaSettingsMap): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(next));
    } catch (e) {
      console.warn('[DcmaSettings] save failed:', e);
    }
  }

  /** Полная замена карты настроек с безопасным мёржем. */
  setAll(next: Partial<Record<DcmaCheckId, Partial<DcmaCheckSettings>>>): void {
    const cur = buildDefaults();
    for (const id of DCMA_IDS) {
      const patch = next[id];
      cur[id] = patch ? { ...cur[id], ...patch } : cur[id];
    }
    this.settings.set(cur);
    this.persist(cur);
  }

  /** Точечное обновление одного чека. */
  updateOne(id: DcmaCheckId, patch: Partial<DcmaCheckSettings>): void {
    const cur = this.settings();
    const next: DcmaSettingsMap = { ...cur };
    next[id] = { ...cur[id], ...patch };
    this.settings.set(next);
    this.persist(next);
  }

  /** Сброс к значениям по умолчанию. */
  reset(): void {
    const def = buildDefaults();
    this.settings.set(def);
    this.persist(def);
  }

  // ---------- ADVANCED (Check 1) ----------
  private loadAdvanced(): DcmaAdvancedSettings {
    const def = buildAdvancedDefaults();
    try {
      const raw = localStorage.getItem(this.storageKeyAdv);
      if (!raw) return def;
      const parsed = JSON.parse(raw) as Partial<DcmaAdvancedSettings>;
      const a1 = parsed?.[1];
      if (a1) def[1] = {
        ...def[1],
        ...a1,
        thresholds: { ...def[1].thresholds, ...(a1.thresholds ?? {}) },
      };
    } catch (e) {
      console.warn('[DcmaSettings] load advanced failed:', e);
    }
    return def;
  }

  private persistAdvanced(next: DcmaAdvancedSettings): void {
    try {
      localStorage.setItem(this.storageKeyAdv, JSON.stringify(next));
    } catch (e) {
      console.warn('[DcmaSettings] save advanced failed:', e);
    }
  }

  /** Текущие настройки Check 1 (Missing Logic). */
  adv1(): DcmaCheck1Advanced {
    return this.advanced()[1];
  }

  /** Патч настроек Check 1 с корректным мёржем thresholds. */
patchAdv1(patch: DcmaCheck1AdvancedPatch): void {
  const cur = this.advanced();
  const next: DcmaAdvancedSettings = {
    ...cur,
    1: {
      ...cur[1],
      ...patch,
      thresholds: { ...cur[1].thresholds, ...(patch.thresholds ?? {}) },
    },
  };
  this.advanced.set(next);
  this.persistAdvanced(next);
}

  /** Сброс только продвинутых опций Check 1. */
  resetAdv1(): void {
    const cur = this.advanced();
    const next: DcmaAdvancedSettings = { ...cur, 1: adv1Defaults() };
    this.advanced.set(next);
    this.persistAdvanced(next);
  }

  
}
