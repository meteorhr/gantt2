// src/app/dcma/services/adv/adv13-settings.types.ts

/**
 * Advanced-настройки для DCMA Check 13 (CPLI).
 * Без зависимостей от сервисов/моделей, чтобы исключить циклы импорта.
 */
export interface DcmaCheck13Advanced {
  /** Включать служебные детали (если они появятся в будущем API результата) */
  includeDetails: boolean;

  /** Источник прогнозного финиша при агрегировании по проекту */
  forecastSource: 'EF_LF_AF' | 'EF' | 'LF' | 'AF';

  /** Переопределение Data Date (ISO). Если null — берём из PROJECT по полям ниже. */
  dataDateOverrideISO: string | null;

  /** Порядок приоритета полей PROJECT для извлечения Data Date */
  dataDateFieldOrder: string[];

  /** Порядок предпочтения полей Baseline Finish на уровне задач */
  baselineFinishFieldsOrder: string[];

  /** Округлять CPL < 0 до 0 (по умолчанию true) */
  clampNegativeCpl: boolean;

  /** Фильтры eligible-набора активностей */
  ignoreWbsSummaryActivities: boolean;
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreCompletedActivities: boolean;

  /**
   * Пороги/допуски:
   * - requiredTolerancePct — допуск для Pass (|CPLI-1| ≤ requiredTolerancePct%)
   * - great/average — только для визуальной оценки (градация KPI в UI)
   */
  thresholds: {
    requiredTolerancePct: number;  // Pass (по умолчанию 5)
    averageTolerancePct: number;   // KPI «Average» (по умолчанию 5)
    greatTolerancePct: number;     // KPI «Great» (по умолчанию 2)
  };
}