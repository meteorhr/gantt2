// src/app/dcma/services/adv/adv11-settings.types.ts

/**
 * Advanced-настройки для DCMA Check 11 (Missed Tasks).
 * Pass: missedPercent <= thresholds.requiredMaxPct (DCMA требование).
 * KPI:  great/average влияют только на визуальную оценку (Grade), не на Pass.
 */
export interface DcmaCheck11Advanced {
  /** Включать подробные списки нарушителей */
  includeDetails: boolean;

  /** Лимит элементов в списке деталей */
  detailsLimit: number;

  /** Фильтры уровня активностей (применяются ДО формирования множества completed) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  /** Обычно для Check 11 не требуется, оставлено для унификации фильтров */
  ignoreCompletedActivities: boolean;

  /** Пороговые уровни (в процентах): required — для Pass; остальные — для KPI */
  thresholds: {
    /** DCMA required: доля AF > BL Finish должна быть ≤ этого значения */
    requiredMaxPct: number;
    /** KPI: "Average" — если процент ≤ этого значения (и > great) */
    averageMaxPct: number;
    /** KPI: "Great" — если процент ≤ этого значения */
    greatMaxPct: number;
  };
}