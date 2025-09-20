// src/app/dcma/services/adv/adv8-settings.types.ts

/**
 * Advanced-настройки DCMA Check 8 (High Duration).
 * Проверка: среди незавершённых задач доля с Remaining Duration > thresholdDays (по календарю) ≤ requiredMaxPct%.
 * - Pass основан ТОЛЬКО на thresholds.requiredMaxPct.
 * - averageMaxPct / greatMaxPct влияют только на визуальную оценку (Grade).
 * - hoursPerDay — ТОЛЬКО фолбэк, если у задачи нет валидного календаря.
 */
export interface DcmaCheck8Advanced {
  /** Включать подробные списки нарушителей */
  includeDetails: boolean;

  /** Максимум элементов в деталях */
  detailsLimit: number;

  /** Порог высокой оставшейся длительности в ДНЯХ (по календарю задачи) */
  thresholdDays: number; // по DCMA по умолчанию 44

  /** Фолбэк часов/день, если календарь задачи не найден/некорректен */
  hoursPerDay: number;

  /** Фильтры по активностям */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;        // включает Hammock/SUMMARY как LOE-семейство
  ignoreWbsSummaryActivities: boolean; // исключать WBS summary
  ignoreCompletedActivities: boolean;  // исключать Completed

  /** Пороговые значения (меньше — лучше). Pass = percent ≤ requiredMaxPct */
  thresholds: {
    requiredMaxPct: number; // DCMA требование, по умолчанию 5.0
    averageMaxPct: number;  // KPI: «Average» ≤ this
    greatMaxPct: number;    // KPI: «Great»   ≤ this
  };
}