// src/app/dcma/services/adv/adv10-settings.types.ts

/**
 * Advanced-настройки DCMA Check 10 (Resources).
 * Pass: percentWithoutResource <= thresholds.requiredMaxPct (по DCMA = 0%).
 * KPI: great/average влияют только на Grade, не на Pass.
 */
export interface DcmaCheck10Advanced {
  /** Включать подробные списки нарушителей */
  includeDetails: boolean;

  /** Лимит элементов в деталях */
  detailsLimit: number;

  /**
   * Порог длительности в ДНЯХ: задачи с эффективной длительностью >= thresholdDays * HPD
   * попадают в знаменатель проверки. Допустимы дробные значения (например, 0.5 дня).
   */
  durationDayThreshold: number;

  /** Фильтры по активностям */
  ignoreMilestoneActivities: boolean;     // исключить вехи
  ignoreLoEActivities: boolean;           // исключить LOE/Hammock/SUMMARY
  ignoreWbsSummaryActivities: boolean;    // исключить WBS summary
  ignoreCompletedActivities: boolean;     // исключить Completed

  /** Пороговые уровни (в процентах) */
  thresholds: {
    /** DCMA required: 0 по умолчанию — все задачи >= 1 дня должны иметь ресурсы */
    requiredMaxPct: number;
    /** KPI: "Average" — если процент ≤ этого значения (и > great) */
    averageMaxPct: number;
    /** KPI: "Great" — если процент ≤ этого значения */
    greatMaxPct: number;
  };
}