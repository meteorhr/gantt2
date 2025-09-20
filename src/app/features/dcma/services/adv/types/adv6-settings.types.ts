// src/app/dcma/services/adv/adv6-settings.types.ts

/** Advanced-настройки чек-6 (High Float) */
export type DcmaCheck6Advanced = {
  /** Детализация */
  includeDetails: boolean;
  detailsLimit: number;

  /**
   * Фолбэк «часов в дне» (HPD), если календарь задачи недоступен/некорректен.
   * Основной HPD всегда берётся из календарей задач, если возможно.
   */
  hoursPerDay: number;

  /**
   * Порог высокого флота в ДНЯХ (по DCMA обычно 44).
   * Расчёт идёт через TF (часы) / HPD задачи.
   */
  dayThreshold: number;

  /** Фильтры уровня активностей (исключаются из знаменателя) */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;

  /**
   * Пороги KPI/Pass для процентов high float:
   * Pass = percentHighFloat ≤ requiredMaxPct;
   * Grade — по great/average (меньше = лучше).
   */
  thresholds: { requiredMaxPct: number; averageMaxPct: number; greatMaxPct: number };
};