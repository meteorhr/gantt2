// src/app/dcma/services/adv/adv9-settings.types.ts

/**
 * Advanced-настройки DCMA Check 9 (Invalid Dates).
 * 9a: Forecast < Data Date (с учётом forecastToleranceDays)
 * 9b: Actual   > Data Date (с учётом actualToleranceDays)
 *
 * Pass = (invalidForecastCount + invalidActualCount) ≤ thresholds.requiredMaxTotalCount (обычно 0).
 * Пороговые KPI ниже (great/average) влияют ТОЛЬКО на Grade.
 */
export interface DcmaCheck9Advanced {
  /** Включать подробные списки нарушителей */
  includeDetails: boolean;

  /** Лимит элементов в деталях */
  detailsLimit: number;

  /** Допуск по дням для 9a: Forecast считается некорректным, если < (DD - tol). */
  forecastToleranceDays: number;

  /** Допуск по дням для 9b: Actual считается некорректным, если > (DD + tol). */
  actualToleranceDays: number;

  /** Фильтры уровня активностей (применяются до проверок 9a/9b) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;        // LOE/Hammock/SUMMARY
  ignoreWbsSummaryActivities: boolean; // TT_WBS
  ignoreCompletedActivities: boolean;  // исключать Completed глобально

  /**
   * Пороговые уровни (по количеству нарушений: 9a + 9b).
   * DCMA требование обычно = 0.
   */
  thresholds: {
    /** Pass/Fail, "required" — допустимое суммарное число нарушений (обычно 0). */
    requiredMaxTotalCount: number;
    /** KPI: "Average" — если totalInvalid ≤ этого значения (и > great) */
    averageMaxTotalCount: number;
    /** KPI: "Great" — если totalInvalid ≤ этого значения */
    greatMaxTotalCount: number;
  };
}