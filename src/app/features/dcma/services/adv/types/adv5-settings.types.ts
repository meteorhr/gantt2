// src/app/dcma/services/adv/adv5-settings.types.ts

export type DcmaCheck5Advanced = {
  /** Детализация */
  includeDetails: boolean;
  detailsLimit: number;

  /** Фильтры уровня активностей (исключаются из знаменателя) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;

  /**
   * Пороговые значения для доли hard-ограничений (%):
   * Pass = percentHard ≤ requiredMaxPct;
   * Grade — по great/average (меньше = лучше).
   */
  thresholds: { requiredMaxPct: number; averageMaxPct: number; greatMaxPct: number };
};