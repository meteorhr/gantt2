// src/app/p6/services/dcma-settings.service.ts
import { Injectable, signal } from '@angular/core';

export interface DcmaCheckSettings {
  enabled: boolean;
  showInTable: boolean;
}

// ---- КЛЮЧЕВОЕ: фиксированный набор ID чеков
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

@Injectable({ providedIn: 'root' })
export class DcmaSettingsService {
  private readonly storageKey = 'dcma.checks.settings.v1';
  readonly settings = signal<DcmaSettingsMap>(this.load());

  private load(): DcmaSettingsMap {
    const def = buildDefaults();
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return def;

      // допускаем частичный JSON и корректно мёржим
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

  setAll(next: Partial<Record<DcmaCheckId, Partial<DcmaCheckSettings>>>): void {
    const cur = buildDefaults();
    for (const id of DCMA_IDS) {
      const patch = next[id];
      cur[id] = patch ? { ...cur[id], ...patch } : cur[id];
    }
    this.settings.set(cur);
    this.persist(cur);
  }

  updateOne(id: DcmaCheckId, patch: Partial<DcmaCheckSettings>): void {
    const cur = this.settings();
    const next: DcmaSettingsMap = { ...cur };
    next[id] = { ...cur[id], ...patch };
    this.settings.set(next);
    this.persist(next);
  }

  reset(): void {
    const def = buildDefaults();
    this.settings.set(def);
    this.persist(def);
  }
}
