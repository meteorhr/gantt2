// src/app/dcma/services/adv/adv12-settings.types.ts

/**
 * Advanced-настройки для DCMA Check 12 (Critical Path Test).
 * HPD (hours per day) берётся из календарей (см. сервис расчёта) — отдельная настройка HPD не нужна.
 */
export interface DcmaCheck12Advanced {
  /** Включать подробности в результат (список критических ID, счётчики DQ) */
  includeDetails: boolean;

  /**
   * Порог тотального флоата (в часах), на основании которого активность считается критической.
   * Если включён режим auto, сервис сам вычислит порог от медианного HPD проекта.
   */
  floatThresholdMode: 'auto' | 'fixed';
  /** Значение порога TF в часах для режима 'fixed'. Игнорируется, если включён 'auto'. */
  floatThresholdHours: number;

  /** Имитационная задержка (дни) для эвристического теста (используется как параметр отчёта) */
  simulatedDelayDays: number;

  /** Фильтры уровня активностей */
  ignoreMilestoneActivities: boolean;
  ignoreLoEActivities: boolean;
  ignoreWbsSummaryActivities: boolean;
  ignoreCompletedActivities: boolean;
}