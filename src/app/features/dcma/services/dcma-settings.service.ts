import { Injectable, signal } from '@angular/core';
import {
  DcmaCheckId, DCMA_IDS, DcmaCheck1Advanced, DcmaCheck1AdvancedPatch,
  DcmaCheckCommonSettings, SETTINGS_STORAGE_KEY,
  DEFAULT_PERSISTED_V1, PersistedSettingsV1, normalizePersisted, DCMA_CHECK_LABELS
} from './dcma-checks.config';

export { DCMA_IDS,  DCMA_CHECK_LABELS };
export type { DcmaCheckId, DcmaCheck1Advanced, DcmaCheck1AdvancedPatch };

@Injectable({ providedIn: 'root' })
export class DcmaSettingsService {
  /** Вся сохраненная структура (общие + advanced) */
  private persisted = signal<PersistedSettingsV1>(DEFAULT_PERSISTED_V1);

  /** Сигналы для удобного доступа */
  readonly settings = signal<Record<DcmaCheckId, DcmaCheckCommonSettings>>(
    structuredClone(DEFAULT_PERSISTED_V1.common)
  );
  readonly adv1 = signal<DcmaCheck1Advanced>(
    structuredClone(DEFAULT_PERSISTED_V1.adv1)
  );

  constructor() {
    // Пытаемся загрузить из localStorage при создании сервиса (SSR-safe: только в браузере)
    this.loadFromLocalStorage();
  }

  /** Вызываем при инициализации вкладки: гарантирует, что localStorage заполнен дефолтами */
  ensureInitialized(): void {
    // если ключ не существует — записываем дефолты
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) this.saveToLocalStorage();
    }
  }

  /** Обновить один чек (enabled/showInTable) */
  updateOne(id: DcmaCheckId, patch: Partial<DcmaCheckCommonSettings>): void {
    const cur = this.settings();
    const next = { ...cur, [id]: { ...cur[id], ...patch } };
    this.settings.set(next);

    const p = this.persisted();
    const p2: PersistedSettingsV1 = { ...p, common: next };
    this.persisted.set(p2);
    this.saveToLocalStorage();
  }

  /** Сброс к дефолтам */
  reset(): void {
    this.persisted.set(structuredClone(DEFAULT_PERSISTED_V1));
    this.settings.set(structuredClone(DEFAULT_PERSISTED_V1.common));
    this.adv1.set(structuredClone(DEFAULT_PERSISTED_V1.adv1));
    this.saveToLocalStorage();
  }

  /** Патч advanced-настроек чек-1 */
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

  /** Опции для сервиса analyzeCheck1 на основе adv1 */
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
      // У нас один флаг на два типа; при включении ЛЮБОГО — не исключаем
      excludeLoEAndHammock: !(a.includeLoE || a.includeWbsSummary),
      ignoreLoEAndHammockLinksInLogic: true,
      treatMilestonesAsExceptions: !!a.includeMilestones,
      includeLists: true,
      includeDQ: true,
    };
  }

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
    const p = this.persisted();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(p));
  }
}
