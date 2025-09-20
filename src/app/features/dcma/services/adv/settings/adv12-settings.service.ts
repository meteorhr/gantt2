// src/app/dcma/services/adv/adv12-settings.service.ts
import { Injectable, signal } from '@angular/core';
import type { DcmaCheck12Advanced } from '../types/adv12-settings.types';
import type { DcmaCheck12Options } from '../../../../../p6/services/dcma/src/check/check12.service';

@Injectable({ providedIn: 'root' })
export class DcmaAdv12SettingsService {
  private readonly adv12Key = 'dcma.adv.12';
  private readonly adv12Signal = signal<DcmaCheck12Advanced>(this.loadAdv12());

  /** Текущие Advanced-настройки (readonly getter) */
  adv12(): DcmaCheck12Advanced { return this.adv12Signal(); }

  /** SSR-safe инициализация дефолтов в localStorage (вызвать при старте вкладки/диалога) */
  ensureInitialized(): void {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(this.adv12Key)) {
      const def = this.defaultAdv12();
      localStorage.setItem(this.adv12Key, JSON.stringify(def));
      this.adv12Signal.set(def);
    }
  }

  /** Сброс только Advanced-12 к дефолтам */
  resetAdv12(): void {
    const def = this.defaultAdv12();
    this.adv12Signal.set(def);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv12Key, JSON.stringify(def));
    }
  }

  /** Частичный патч с аккуратным мёрджем */
  patchAdv12(patch: Partial<DcmaCheck12Advanced>): void {
    const cur = this.adv12Signal();
    const next: DcmaCheck12Advanced = {
      ...cur,
      ...patch,
      // защита от мусора в режимах
      floatThresholdMode: patch.floatThresholdMode === 'fixed' ? 'fixed' : (patch.floatThresholdMode === 'auto' ? 'auto' : cur.floatThresholdMode),
      floatThresholdHours: this.clampPosInt(patch.floatThresholdHours ?? cur.floatThresholdHours, 1, 1_000_000),
      simulatedDelayDays: this.clampPosInt(patch.simulatedDelayDays ?? cur.simulatedDelayDays, 1, 10_000),
    };
    this.adv12Signal.set(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.adv12Key, JSON.stringify(next));
    }
  }

  /** Собрать опции для сервиса анализа Check 12 */
  buildCheck12Options(): DcmaCheck12Options {
    const a = this.adv12();
    return {
      // auto -> undefined (сервис сам рассчитает порог от календарей),
      // fixed -> жёсткое значение в часах
      floatThresholdHours: a.floatThresholdMode === 'fixed' ? a.floatThresholdHours : undefined,
      simulatedDelayDays: a.simulatedDelayDays,

      // фильтры
      ignoreMilestoneActivities: a.ignoreMilestoneActivities,
      ignoreLoEActivities: a.ignoreLoEActivities,
      ignoreWbsSummaryActivities: a.ignoreWbsSummaryActivities,
      ignoreCompletedActivities: a.ignoreCompletedActivities,
    };
  }

  // ===== I/O =====
  private loadAdv12(): DcmaCheck12Advanced {
    if (typeof window === 'undefined') return this.defaultAdv12();
    const raw = localStorage.getItem(this.adv12Key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { ...this.defaultAdv12(), ...parsed };
      } catch { /* ignore parse errors */ }
    }
    const def = this.defaultAdv12();
    localStorage.setItem(this.adv12Key, JSON.stringify(def));
    return def;
  }

  private defaultAdv12(): DcmaCheck12Advanced {
    return {
      includeDetails: true,

      // По умолчанию порог TF выбирается автоматически от HPD календарей (см. сервис расчёта)
      floatThresholdMode: 'auto',
      floatThresholdHours: 8,     // запасное значение для режима 'fixed' (1 рабочий день по 8 ч)

      simulatedDelayDays: 600,    // совместимо с текущим поведением check12.service.ts

      // Фильтры по активностям (по умолчанию выключены, чтобы не менять расчёт)
      ignoreMilestoneActivities: false,
      ignoreLoEActivities: false,
      ignoreWbsSummaryActivities: false,
      ignoreCompletedActivities: false,
    };
  }

  // ===== utils =====
  private clampPosInt(v: unknown, min: number, max: number): number {
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  /** Визуальная оценка Check 12: OK → great, иначе poor (без среднего состояния). */
evaluateCheck12Grade(ok: boolean): 'great' | 'average' | 'poor' {
  return ok ? 'great' : 'poor';
}

/** Pass/Fail для Check 12: проксируем boolean. */
evaluateCheck12Pass(ok: boolean): boolean {
  return !!ok;
}
}