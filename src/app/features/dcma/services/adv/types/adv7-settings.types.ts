// src/app/dcma/services/adv/adv7-settings.types.ts

/**
 * Advanced-настройки DCMA Check 7 (Negative Float).
 * Цель DCMA: отрицательного флота быть НЕ должно.
 * - Pass основан на строгом правиле (strictZero: true) — нарушителей 0.
 * - При необходимости можно ослабить до процента (requiredMaxPct), тогда Pass = percent ≤ requiredMaxPct.
 * - toleranceHours влияет на определение «отрицательный TF» (TF < -toleranceHours).
 * - hoursPerDay — фолбэк, основной HPD берётся из календаря задачи.
 */
export interface DcmaCheck7Advanced {
  /** Включать подробные списки нарушителей */
  includeDetails: boolean;

  /** Максимум элементов в деталях */
  detailsLimit: number;

  /** Фолбэк часов/день, если календарь задачи не найден/некорректен */
  hoursPerDay: number;

  /**
   * Допуск по отрицательному флоту (часы).
   * Активность считается нарушителем, если TF < -toleranceHours.
   * По умолчанию 0 (строгое DCMA).
   */
  toleranceHours: number;

  /** Фильтры уровня активностей */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;

  /** Режим Pass/Fail и KPI-пороги */
  mode: {
    /**
     * Строгое правило DCMA: true → Pass только если нарушителей 0.
     * false → Pass по требуемому максимуму процента нарушителей (requiredMaxPct).
     */
    strictZero: boolean;

    /**
     * Пороговые значения в процентах (меньше — лучше).
     * - requiredMaxPct — влияет на Pass только если strictZero=false.
     * - great/average — влияют только на визуальный Grade (KPI).
     */
    thresholds: {
      requiredMaxPct: number; // по умолчанию 0.0 (DCMA-строго)
      averageMaxPct: number;  // KPI
      greatMaxPct: number;    // KPI
    };
  };
}