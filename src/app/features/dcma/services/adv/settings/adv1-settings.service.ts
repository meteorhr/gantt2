import { Injectable, signal } from '@angular/core';
import {
  DcmaCheckId,
  DcmaCheckCommonSettings, SETTINGS_STORAGE_KEY,
  DEFAULT_PERSISTED_V1, PersistedSettingsV1, normalizePersisted,
  DcmaCheck1AdvancedPatch
} from '../dcma-checks.config';
import type { DcmaCheck1Advanced } from '../types/adv1-settings.types';

@Injectable({ providedIn: 'root' })
export class DcmaCommonSettingsService {
  /** Вся сохранённая структура (общие + adv1) под единым ключом */
  readonly persisted = signal<PersistedSettingsV1>(DEFAULT_PERSISTED_V1);
  /** Общие настройки по чекам */
  readonly settings = signal<Record<DcmaCheckId, DcmaCheckCommonSettings>>(
    structuredClone(DEFAULT_PERSISTED_V1.common)
  );
  /** Advanced Check 1 (хранится внутри persisted) */
  readonly adv1 = signal<DcmaCheck1Advanced>(
    structuredClone(DEFAULT_PERSISTED_V1.adv1)
  );

  constructor() {
    this.loadFromLocalStorage();
  }

  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(SETTINGS_STORAGE_KEY)) this.saveToLocalStorage();
  }

  updateOne(id: DcmaCheckId, patch: Partial<DcmaCheckCommonSettings>): void {
    const cur = this.settings();
    const next = { ...cur, [id]: { ...cur[id], ...patch } };
    this.settings.set(next);

    const p = this.persisted();
    const p2: PersistedSettingsV1 = { ...p, common: next };
    this.persisted.set(p2);
    this.saveToLocalStorage();
  }

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

  resetBase(): void {
    this.persisted.set(structuredClone(DEFAULT_PERSISTED_V1));
    this.settings.set(structuredClone(DEFAULT_PERSISTED_V1.common));
    this.adv1.set(structuredClone(DEFAULT_PERSISTED_V1.adv1));
    this.saveToLocalStorage();
  }

  // ===== I/O =====
  private loadFromLocalStorage(): void {
    if (typeof window === 'undefined') return;

    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      this.persisted.set(structuredClone(DEFAULT_PERSISTED_V1));
      this.settings.set(structuredClone(DEFAULT_PERSISTED_V1.common));
      this.adv1.set(structuredClone(DEFAULT_PERSISTED_V1.adv1));
      return;
    }
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

  private saveToLocalStorage(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.persisted()));
  }
}