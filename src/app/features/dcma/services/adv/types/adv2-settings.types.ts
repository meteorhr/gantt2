// src/app/dcma/services/adv/adv2-settings.types.ts

export type DcmaCheck2Advanced = {
  /** Строгий режим (0 lead-связей) */
  strictZero: boolean;

  /** Детализация вывода */
  includeDetails: boolean;
  detailsLimit: number;

  /** HPD: источник и фолбэк */
  hoursPerDay: number;
  calendarSource: 'successor' | 'predecessor' | 'fixed';
  fixedHoursPerDay: number;

  /** Типы связей, учитываемые в расчёте */
  includeLinkTypes: { FS: boolean; SS: boolean; FF: boolean; SF: boolean };

  /** Фильтры по типам активностей у связей */
  ignoreMilestoneRelations: boolean;
  ignoreLoERelations: boolean;
  ignoreWbsSummaryRelations: boolean;
  ignoreCompletedRelations: boolean;

  /** KPI-пороги (меньше = лучше) */
  thresholds: { greatPct: number; averagePct: number };

  /** Допуски, если strictZero = false */
  tolerance: { percent: number; count: number; totalLeadHours: number };
};